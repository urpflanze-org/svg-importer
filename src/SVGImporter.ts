import { fromTransformAttribute, fromDefinition, compose, toSVG } from 'transformation-matrix'
import simplify from 'simplify-js'
import * as svgpath from 'svgpath'
// import { JSDOM } from 'jsdom'
// import { svgPathProperties } from 'svg-path-properties'

import { createSVGWindow } from 'svgdom'
import { SVG, Path, registerWindow, Matrix } from '@svgdotjs/svg.js'

import { Scene, Shape, ShapeBuffer, Group } from '@urpflanze/core'
import { parseColor } from '@urpflanze/color'

import { ISVGParsedPath, ISVGParsed, ISVGElementConversion, ISVGDrawer } from './types'
import { conversion, fromPercentage } from './utilities'
import { EAdaptMode, IPropArguments, IShapeBounding } from '@urpflanze/core/dist/types'

/**
 *
 * @category Services.Export/Import
 * @class JSONImporter
 */
class SVGImporter {
	/**
	 * Match hex color
	 * @static
	 */
	static readonly HEX_REGEX: string = '#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})'

	/**
	 * Match string is SVG
	 * @static
	 */
	static readonly SVG_REGEX = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*\s*(?:\[?(?:\s*<![^>]*>\s*)*\]?)*[^>]*>\s*)?(?:<svg[^>]*>[^]*<\/svg>|<svg[^/>]*\/\s*>)\s*$/i

	/**
	 * Match commments
	 *
	 * @static
	 */
	static readonly COMMENT_REGEX = /<!--([\s\S]*?)-->/g

	/**
	 * Check passed input is valid SVG string
	 *
	 * @static
	 * @param {string} input
	 * @returns {boolean}
	 */
	static isSVG(input: string): boolean {
		return SVGImporter.SVG_REGEX.test(input.replace(SVGImporter.COMMENT_REGEX, ''))
	}

	/**
	 * Convert string to SVGElement
	 *
	 * @static
	 * @param {string} input
	 * @returns {(SVGElement | null)}
	 */
	static stringToSVG(input: string): SVGElement | null {
		input = input.trim()
		if (!SVGImporter.isSVG(input)) {
			console.warn('[Urpflanze:SVGImport] | Input is not valid SVG string', input)
			return null
		}

		const window = createSVGWindow()
		const document = window.document

		registerWindow(window, document)

		const svg = SVG(document.documentElement)
		svg.svg(input)

		return svg.node.firstChild as SVGElement
	}

	/**
	 * Convert SVG string to Shape or ShapeBuffer
	 *
	 * @static
	 * @param {string} input
	 * @param {number} [simplify=0.01]
	 * @returns {(Shape | ShapeBuffer | null)}
	 */
	static parse(input: string, simplify = 0.01): Shape | ShapeBuffer | null {
		if (SVGImporter.isSVG(input) === false) {
			console.warn('[Urpflanze:SVGImport] | Input is not valid svg', input)
			return null
		}

		const parsed = SVGImporter.SVGStringToBuffers(input, simplify)

		if (parsed) {
			return SVGImporter.parsedToShape(parsed)
		}

		return null
	}

	/**
	 * Convert parsed SVG to Shape or ShapeBuffer
	 *
	 * @static
	 * @param {ISVGParsed} parsed
	 * @returns {(Shape | ShapeBuffer | null)}
	 */
	static parsedToShape(parsed: ISVGParsed): Shape | ShapeBuffer | null {
		const shapes: Array<ShapeBuffer> = new Array()

		parsed.buffers.forEach((buffer, i) => {
			const sb = new ShapeBuffer<IPropArguments, ISVGDrawer>({
				shape: buffer.buffer,
				bClosed: buffer.bClosed,
				drawer: buffer.drawer,
			})
			sb && shapes.push(sb)
		})

		if (shapes.length === 1) return shapes[0]

		const group = new Group()
		shapes.forEach(s => group.add(s))
		return new Shape({ shape: group })
	}

	/**
	 * Convert SVG string to buffers
	 *
	 * @static
	 * @param {string} input
	 * @param {number} [simplify=0.01]
	 * @returns {(ISVGParsed | null)}
	 */
	static SVGStringToBuffers(input: string, simplify = 0.01): ISVGParsed | null {
		const svg: SVGElement | null = SVGImporter.stringToSVG(input)

		if (svg === null) {
			console.error('[Urpflanze:SVGImport] | Cannot convert string to svg', input)
			return null
		}

		const viewBox: [number, number, number, number] = SVGImporter.getViewbox(svg)

		const groups = svg.querySelectorAll('g')
		groups.forEach(SVGImporter.propagateGroupTransformAndStyleToChildren)

		// Get all primitive elements
		const elements: Array<SVGElement> = Array.from(
			svg.querySelectorAll('rect, circle, ellipse, line, polyline, polygon, path')
		)

		// Convert elements to path
		const paths: Array<SVGPathElement> = ([] as Array<SVGPathElement>).concat(
			...elements.map(e => SVGImporter.elementToPath(e as SVGElement))
		)

		// Convert paths to buffer of points based on viewBox
		const expMatch = Math.max(viewBox[2] - viewBox[0], viewBox[3] - viewBox[1])
			.toExponential(1)
			.match(/e(\+?[0-9]+)/)
		const exp = Math.min(10 ** Math.max(expMatch ? +expMatch[1] : 0, 0), 1000)
		const steps = 10 / (1000 / exp)

		let buffers: Array<Float32Array> = paths
			.map(path => SVGImporter.pathToBuffer(path, steps, viewBox))
			.filter(b => !!b && b.length >= 2) as Array<Float32Array>

		// Simplify anda adapt buffers
		buffers = buffers.map(buffer => SVGImporter.simpliyBuffer(buffer, simplify))

		// Generate result
		const svgFill = SVGImporter.getStyleAttr('fill', svg)
		const svgStroke = SVGImporter.getStyleAttr('stroke', svg)
		const svgLineWidth = SVGImporter.getStyleAttr('stroke-width', svg)

		const result: Array<ISVGParsedPath> = []
		for (let i = 0; i < buffers.length; i++) {
			const templineWidth = paths[i].getAttribute('stroke-width')
			let strokeWidth

			if (templineWidth) {
				strokeWidth =
					templineWidth.indexOf('%') >= 0
						? fromPercentage(
								parseFloat(templineWidth),
								Math.sqrt((viewBox[2] - viewBox[0]) * (viewBox[3] - viewBox[1]))
						  )
						: parseFloat(templineWidth)
			}

			const fill = SVGImporter.getStyleAttr('fill', paths[i], svgFill ? svgFill : undefined)
			const stroke = SVGImporter.getStyleAttr('stroke', paths[i], fill ? undefined : svgStroke || 'rgba(0,0,0,0)')
			const lineWidth = strokeWidth
				? strokeWidth
				: stroke
				? svgLineWidth
					? parseFloat(svgLineWidth)
					: 1
				: svgLineWidth
				? parseFloat(svgLineWidth)
				: undefined

			result.push({
				buffer: buffers[i],
				bClosed: SVGImporter.pathIsClosed(paths[i]),
				drawer: {
					fill,
					stroke,
					lineWidth,
				},
			})
		}

		elements.forEach((e: SVGElement) => e.remove())

		return { viewBox, buffers: result }
	}

	/**
	 * Replace 'none' to undefined
	 *
	 * @private
	 * @static
	 * @param {('fill' | 'stroke')} name
	 * @param {SVGElement} path
	 * @returns {(string | undefined)}
	 */
	private static getStyleAttr(
		name: 'fill' | 'stroke' | 'stroke-width',
		element: SVGElement,
		defaultColor?: string
	): string | undefined {
		// get color from attribute

		const value = element.getAttribute(name)

		if (value === 'none') return undefined

		let color: string | undefined
		if (typeof value !== 'undefined' && value !== null) {
			color = value
		} else {
			// otherwise get color from style
			const styleName: 'fill' | 'stroke' | 'strokeWidth' = name === 'stroke-width' ? 'strokeWidth' : name
			if (typeof element.style[styleName] !== 'undefined' && element.style[styleName].length > 0) {
				color = element.style[styleName]
			}
		}

		if (typeof color === 'undefined') return defaultColor

		let alpha = 1

		// check opacity in style
		const style = element.getAttribute('style')
		if (style && style.length) {
			const regexp = new RegExp(`${name}-opacity: +?(\\d?.\\d|\\d)`, 'i')
			const match = style.match(regexp)
			if (match) {
				alpha = parseFloat(match[1])
			}
		}

		const parsed = parseColor(color)
		if (parsed) {
			alpha = parsed.alpha !== 1 ? parsed.alpha : alpha

			return parsed.type === 'rgb'
				? `rgba(${parsed.a}, ${parsed.b}, ${parsed.c}, ${alpha})`
				: `hsla(${parsed.a}, ${parsed.b}%, ${parsed.c}%, ${alpha})`
		}

		return defaultColor
	}

	/**
	 * Return SVG viewBox
	 * If it is not present, calculate it based on elements
	 *
	 * @static
	 * @param {SVGElement} svg
	 * @returns {[number, number, number, number]}
	 */
	static getViewbox(svg: SVGElement): [number, number, number, number] {
		// Check viexBox is setted
		const viewBox = svg.getAttribute('viewBox')
		if (viewBox) {
			return viewBox.split(' ').map(e => parseFloat(e)) as [number, number, number, number]
		}

		// Check width and height if viewBox is not setted
		const width = svg.getAttribute('width')
		const height = svg.getAttribute('height')
		if (width && height) {
			return [0, 0, parseFloat(width), parseFloat(height)]
		}

		// Calculate dimension by elements
		svg = svg.cloneNode(true) as SVGElement

		const elements: Array<SVGElement> = Array.from(
			svg.querySelectorAll('rect, circle, ellipse, line, polyline, polygon, path')
		)

		const paths: Array<SVGPathElement> = ([] as Array<SVGPathElement>).concat.apply(
			[],
			elements.map(e => SVGImporter.elementToPath(e as SVGElement))
		)
		if (paths.length > 0) {
			let width = 0,
				height = 0

			for (let i = 0, len = paths.length; i < len; i++) {
				const buffer = SVGImporter.pathToBuffer(paths[i], 1)
				if (buffer) {
					const box = ShapeBuffer.getBounding(buffer)
					box.width += box.x
					box.height += box.y
					if (box.width > width) width = box.width
					if (box.height > height) height = box.height
				}
			}

			return [0, 0, width, height]
		}

		return [-1, -1, 1, 1]
	}

	/**
	 * Check path is closed
	 *
	 * @static
	 * @param {SVGPathElement} path
	 * @returns {boolean}
	 */
	static pathIsClosed(path: SVGPathElement): boolean {
		return path.getAttribute('d')?.trim().substr(-1).toLowerCase() === 'z'
	}

	/**
	 * Optimize number of points
	 *
	 * @static
	 * @param {Float32Array} buffer
	 * @param {number} [simplifyLevel=0.01]
	 * @returns {Float32Array}
	 */
	static simpliyBuffer(buffer: Float32Array, simplifyLevel = 0.01): Float32Array {
		const simplifiedBuffer: Array<{ x: number; y: number }> = []

		for (let i = 0, len = buffer.length; i < len; i += 2) simplifiedBuffer.push({ x: buffer[i], y: buffer[i + 1] })

		const points = simplify(simplifiedBuffer, simplifyLevel, true)
		const result = new Float32Array(points.length * 2)
		points.forEach((point, index) => {
			result[index * 2] = point.x
			result[index * 2 + 1] = point.y
		})

		return result
	}

	/**
	 * Convert path to buffer between [-1, 1]
	 *
	 * @static
	 * @param {SVGPathElement} path
	 * @param {number} [steps=0.01]
	 * @param {*} [viewBox=[-1, -1, 1, 1]]
	 * @returns {Float32Array}
	 */
	static pathToBuffer(path: SVGPathElement, steps = 0.01, viewBox = [-1, -1, 1, 1]): Float32Array | undefined {
		const width = viewBox[2] - viewBox[0]
		const height = viewBox[3] - viewBox[1]

		const r = 2 / Math.max(width, height)

		const originalPathD = path.getAttribute('d') || ''

		// Apply transform matrix to path
		const transform = path.getAttribute('transform') || ''
		let matrix = [1, 0, 0, 0, 1, 0]
		if (transform.length > 0) {
			const transformMatrix = compose(fromDefinition(fromTransformAttribute(transform)))

			matrix = [
				transformMatrix.a,
				transformMatrix.b,
				transformMatrix.c,
				transformMatrix.d,
				transformMatrix.e,
				transformMatrix.f,
			]
		}

		// create path
		// const document = createSVGWindow().document
		// const transformedPathD = svgpath(originalPathD).matrix(matrix).toString()
		// const transformedPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		// transformedPath.setAttribute('d', transformedPathD)

		// const path_length = Math.floor(transformedPath.getTotalLength())
		// const buffer_length = Math.floor(path_length / steps) * 2

		// // Generate buffer
		// const buffer = new Float32Array(buffer_length)
		// for (let i = 0, j = 0; i < path_length; i += steps, j += 2) {
		// 	const { x, y } = transformedPath.getPointAtLength(i) as { x: number; y: number }

		// 	buffer[j] = r * (x - width / 2)
		// 	buffer[j + 1] = r * (y - height / 2)
		// }

		// return buffer

		const transformedPath = new Path({ d: originalPathD }).transform(matrix)
		const path_length = Math.floor(transformedPath.length())
		const buffer_length = Math.floor(path_length / steps) * 2

		// Generate buffer
		const buffer = new Float32Array(buffer_length)
		let j = 0
		for (let i = 0; i < path_length; i += steps) {
			try {
				const { x, y } = transformedPath.pointAt(i) as { x: number; y: number }

				buffer[j] = r * (x - width / 2)
				buffer[j + 1] = r * (y - height / 2)
				j += 2
			} catch (e) {}
		}

		return buffer.subarray(0, j)
	}

	/**
	 * Propagate transform for apply to point in path
	 *
	 * @private
	 * @static
	 * @param {SVGGElement} g
	 */
	private static propagateGroupTransformAndStyleToChildren(g: SVGGElement): void {
		const gTransform = g.getAttribute('transform')

		if (gTransform && gTransform.length > 0) {
			const gMatrix = compose(fromDefinition(fromTransformAttribute(gTransform)))
			const children = g.children

			Array.from(children).forEach(child => {
				let transform = child.getAttribute('transform')
				if (transform && transform.length > 0) {
					const matrix = compose(fromDefinition(fromTransformAttribute(transform)))
					const finalMatrix = compose(matrix, gMatrix)
					transform = toSVG(finalMatrix)
				}

				child.setAttribute('transform', gTransform)
			})
		}

		const attrs = ['fill', 'stroke', 'stroke-width']

		attrs.forEach(attr => {
			const value = g.getAttribute(attr)
			if (value) {
				Array.from(g.children).forEach(child => {
					if (child.getAttribute(attr) === null) {
						child.setAttribute(attr, value)
					}
				})
			}
		})
	}

	/**
	 * Convert SVG Element to Path
	 *
	 * @static
	 * @param {SVGElement} element
	 * @returns {Array<SVGPathElement>}
	 */
	static elementToPath(element: SVGElement): Array<SVGPathElement> {
		const transform = element.getAttribute('transform') || ''
		const fill = SVGImporter.getStyleAttr('fill', element, undefined)
		const stroke = SVGImporter.getStyleAttr('stroke', element, undefined)
		const lineWidth = SVGImporter.getStyleAttr('stroke-width', element, undefined)

		const window = createSVGWindow()
		const document = window.document
		if (element.nodeName == 'path') {
			// Separate multiple path
			const d: string | null = element.getAttribute('d') || ''

			const result = svgpath(d)
				.abs()
				.unarc()
				.toString()
				.split('M')
				.filter((e: string) => e.length > 0)
				.map((e: string) => 'M' + e)

			return result.map((d: string) => {
				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
				path.setAttribute('d', d)
				path.setAttribute('transform', transform)
				path.setAttribute('style', element.getAttribute('style'))
				fill && path.setAttribute('fill', fill)
				stroke && path.setAttribute('stroke', stroke)
				lineWidth && path.setAttribute('lineWidth', lineWidth)
				return path
			})
		}

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		const nodeName = element.nodeName
		if (['rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon'].includes(nodeName)) {
			const d = conversion[nodeName as keyof ISVGElementConversion](element as any)
			path.setAttribute('d', svgpath(d).abs().unarc().toString())
			path.setAttribute('transform', transform)
			path.setAttribute('style', element.getAttribute('style'))
			fill && path.setAttribute('fill', fill)
			stroke && path.setAttribute('stroke', stroke)
			lineWidth && path.setAttribute('lineWidth', lineWidth)
			return [path]
		} else {
			console.warn(`[Urpflanze:SVGImport] | Cannot convert ${nodeName} to path`)
			return []
		}
	}
}

export { SVGImporter }
