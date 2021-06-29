// import { JSDOM } from 'jsdom'
import { Path, registerWindow } from '@svgdotjs/svg.js'
import { parseColor } from '@urpflanze/color'
import { Group, IPropArguments, Shape, ShapeBuffer, Vec2 } from '@urpflanze/core'
import { Adapt } from '@urpflanze/core/dist/modifiers/Adapt'
import simplify from 'simplify-js'
import { createSVGWindow } from 'svgdom'
import * as svgpath from 'svgpath'
import { compose, fromDefinition, fromTransformAttribute, toSVG } from 'transformation-matrix'
import { ISVGDrawer, ISVGElementConversion, ISVGParsed, ISVGParsedPath } from './types'
import { conversion, fromPercentage } from './utilities'

const isBROWSER = typeof window !== 'undefined' && typeof document !== 'undefined'

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
	static readonly SVG_REGEX =
		/^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*\s*(?:\[?(?:\s*<![^>]*>\s*)*\]?)*[^>]*>\s*)?(?:<svg[^>]*>[^]*<\/svg>|<svg[^/>]*\/\s*>)\s*$/i

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
	 * Convert string to SVGSVGElement
	 *
	 * @static
	 * @param {string} input
	 * @returns {(SVGSVGElement | null)}
	 */
	static stringToSVG(input: string): SVGSVGElement | null {
		input = input.trim()
		if (!SVGImporter.isSVG(input)) {
			console.warn('[Urpflanze:SVGImport] | Input is not valid SVG string', input)
			return null
		}

		// const doc = new JSDOM(input).window.document
		const _window = isBROWSER ? window : createSVGWindow()
		const document = _window.document

		if (!isBROWSER) {
			registerWindow(_window, document)
		}

		const div = document.createElement('div')
		div.innerHTML = input
		return div.firstChild as SVGSVGElement
	}

	/**
	 * Convert SVG string to Shape or ShapeBuffer
	 *
	 * @static
	 * @param {string} input
	 * @param {number} [simplify=0.01]
	 * @param {number} [sideLength]
	 * @returns {(Shape | ShapeBuffer | null)}
	 */
	static parse(input: string, simplify = 0.01, sideLength?: number): Shape | ShapeBuffer | null {
		if (SVGImporter.isSVG(input) === false) {
			console.warn('[Urpflanze:SVGImport] | Input is not valid svg', input)
			return null
		}

		const parsed = SVGImporter.svgToBuffers(input, simplify)

		if (parsed) {
			return SVGImporter.parsedToShape(parsed, sideLength)
		}

		return null
	}

	/**
	 * Convert parsed SVG to Shape or ShapeBuffer
	 *
	 * @static
	 * @param {ISVGParsed} parsed
	 * @param {number} sideLength
	 * @returns {(Shape | ShapeBuffer | null)}
	 */
	static parsedToShape(parsed: ISVGParsed, sideLength?: number): Shape | ShapeBuffer | null {
		const shapes: Array<ShapeBuffer> = []

		parsed.buffers.forEach((buffer, i) => {
			const sb = new ShapeBuffer<IPropArguments, ISVGDrawer>({
				shape: buffer.buffer,
				bClosed: buffer.bClosed,
				sideLength,
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
	static svgToBuffers(input: SVGSVGElement | string, simplify = 0.01): ISVGParsed | null {
		const svg: SVGSVGElement | null = typeof input === 'string' ? SVGImporter.stringToSVG(input) : input

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

		// Simplify and adapt buffers
		buffers = buffers.map(buffer => SVGImporter.simpliyBuffer(buffer, simplify))

		// remove last point if shape is closed
		buffers = buffers.map((buffer, index) => {
			const bClosed = SVGImporter.pathIsClosed(paths[index])
			if (bClosed) {
				const distance = Vec2.distance([buffer[0], buffer[1]], [buffer[buffer.length - 2], buffer[buffer.length - 1]])
				if (distance < 1) return buffer.subarray(0, buffer.length - 2)
			}

			return buffer
		})

		// Generate result
		const h = Math.sqrt((viewBox[2] - viewBox[0]) * (viewBox[3] - viewBox[1]))
		const svgFill = SVGImporter.getStyleAttr('fill', svg)
		const svgStroke = SVGImporter.getStyleAttr('stroke', svg)
		const svgLineWidth = SVGImporter.getStyleAttr('stroke-width', svg, h / 100)

		const result: Array<ISVGParsedPath> = []
		for (let i = 0; i < buffers.length; i++) {
			const templineWidth = paths[i].getAttribute('stroke-width')
			let strokeWidth

			if (templineWidth) {
				strokeWidth =
					templineWidth.indexOf('%') >= 0 ? fromPercentage(parseFloat(templineWidth), h) : parseFloat(templineWidth)
			}

			const fill = SVGImporter.getStyleAttr('fill', paths[i], svgFill ? svgFill : undefined) as string | undefined
			const stroke = SVGImporter.getStyleAttr(
				'stroke',
				paths[i],
				fill ? undefined : svgStroke || 'rgba(255,255,255)'
			) as string | undefined
			const lineWidth = (strokeWidth ? strokeWidth : stroke ? svgLineWidth : undefined) as number | undefined

			result.push({
				buffer: buffers[i],
				bClosed: SVGImporter.pathIsClosed(paths[i]),
				drawer: {
					fill,
					stroke,
					lineWidth: lineWidth ? lineWidth / (h / 100) : undefined,
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
		defaultValue?: string | number
	): string | number | undefined {
		// get color from attribute
		const attr = element.getAttribute(name)
		if (attr === 'none') return undefined

		let value: string | undefined
		if (typeof attr !== 'undefined' && attr !== null) {
			value = attr
		} else {
			// otherwise get color from style
			const styleName: 'fill' | 'stroke' | 'strokeWidth' = name === 'stroke-width' ? 'strokeWidth' : name
			if (typeof element.style[styleName] !== 'undefined' && element.style[styleName].length > 0) {
				value = element.style[styleName]
			}
		}

		if (typeof value === 'undefined') return defaultValue

		if (name === 'stroke-width') return parseFloat(value)

		let alpha = parseFloat(element.getAttribute('opacity') || '1')

		// check opacity in style
		const style = element.getAttribute('style')
		if (style && style.length) {
			const regexp = new RegExp(`${name}-opacity: +?(\\d?.\\d|\\d)`, 'i')
			const match = style.match(regexp)
			if (match) {
				alpha = parseFloat(match[1])
			}
		}

		const parsed = parseColor(value)
		if (parsed) {
			alpha = parsed.alpha !== 1 ? parsed.alpha : alpha

			return parsed.type === 'rgb'
				? `rgba(${parsed.a}, ${parsed.b}, ${parsed.c}, ${alpha})`
				: `hsla(${parsed.a}, ${parsed.b}%, ${parsed.c}%, ${alpha})`
		}

		return defaultValue
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

		if (width && height) return [0, 0, parseFloat(width), parseFloat(height)]

		svg = svg.cloneNode(true) as SVGSVGElement

		const elements: Array<SVGElement> = Array.from(
			svg.querySelectorAll('rect, circle, ellipse, line, polyline, polygon, path')
		)

		const paths: Array<SVGPathElement> = ([] as Array<SVGPathElement>).concat.apply(
			[],
			elements.map(SVGImporter.elementToPath)
		)

		let c_width = 0,
			c_height = 0

		for (let i = 0, len = paths.length; i < len; i++) {
			const buffer = SVGImporter.pathToBuffer(paths[i], 1)
			if (buffer) {
				const box = Adapt.getBounding(buffer)
				box.width += box.x
				box.height += box.y
				if (box.width > c_width) c_width = box.width
				if (box.height > c_height) c_height = box.height
			}
		}

		return [0, 0, c_width, c_height]
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
	 * Transform path to absolute and apply transformation if exist
	 *
	 * @param path
	 * @param transform
	 * @returns
	 */
	private static sanitizePath(path: string, transform?: string): string {
		return svgpath(path)
			.abs()
			.unarc()
			.transform(transform || '')
			.toString()
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

		// create path
		const _window = isBROWSER ? window : createSVGWindow()
		const document = _window.document

		if (!isBROWSER) {
			registerWindow(_window, document)
		}

		const originalPathD = path.getAttribute('d') as string
		const transform = path.getAttribute('transform') || ''

		// apply transform to path
		const transformedPath = new Path({ d: SVGImporter.sanitizePath(originalPathD, transform) })

		const path_length = Math.floor(transformedPath.length())
		const buffer_length = Math.floor(path_length / steps) * 2

		// Generate buffer
		const buffer = new Float32Array(buffer_length)
		let j = 0
		for (let i = 0; i < path_length; i += steps) {
			const { x, y } = transformedPath.pointAt(i) as { x: number; y: number }

			buffer[j] = r * (x - width / 2)
			buffer[j + 1] = r * (y - height / 2)
			j += 2
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
					const finalMatrix = compose(gMatrix, matrix)

					transform = toSVG(finalMatrix)
				} else {
					transform = gTransform
				}

				child.setAttribute('transform', transform)
			})
		}

		const attrs = ['fill', 'stroke', 'stroke-width', 'style']

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
		const _window = isBROWSER ? window : createSVGWindow()
		const document = _window.document

		if (!isBROWSER) {
			registerWindow(_window, document)
		}
		// const document = new JSDOM('').window.document

		let paths: Array<string> = []

		if (element.nodeName === 'path') {
			// Separate multiple path
			paths = svgpath(element.getAttribute('d') || '')
				.abs()
				.unarc()
				.toString()
				.split('M')
				.filter((e: string) => e.length > 0)
				.map((e: string) => 'M' + e)
		} else if (['rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon'].includes(element.nodeName)) {
			paths = [conversion[element.nodeName as keyof ISVGElementConversion](element as any)]
		} else {
			console.warn(`[Urpflanze:SVGImport] | Cannot convert ${element.nodeName} to path`)
		}

		return paths.map(d => {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

			path.setAttribute('d', d)
			path.setAttribute('transform', element.getAttribute('transform') || '')
			path.setAttribute('style', element.getAttribute('style') || '')
			path.setAttribute('fill', SVGImporter.getStyleAttr('fill', element, '') + '')
			path.setAttribute('stroke', SVGImporter.getStyleAttr('stroke', element, '') + '')
			path.setAttribute('opacity', element.getAttribute('opacity') || '1')
			path.setAttribute('stroke-width', SVGImporter.getStyleAttr('stroke-width', element, '') + '')

			return path
		})
	}
}

export { SVGImporter }
