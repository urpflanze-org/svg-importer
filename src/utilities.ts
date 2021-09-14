import { ISVGElementConversion } from './types'

/**
 * Get percentage to number
 *
 * @private
 * @static
 * @param {(number | string)} val
 * @param {number} base
 * @returns {number}
 */
export const fromPercentage = (val: number | string, base: number): number => {
	return /%$/.test(val + '') ? (parseFloat((val + '').replace('%', '')) * 100) / base : +val
}

/**
 * Separate multiple array
 *
 * @private
 * @static
 * @param {(Array<string | number>)} arr
 * @param {number} [size=2]
 * @returns {(Array<Array<string | number>>)}
 */
const chunk = (arr: Array<string | number>, size = 2): Array<Array<string | number>> => {
	const results: Array<Array<string | number>> = []

	while (arr.length > 0) results.push(arr.splice(0, size))

	return results
}

const conversion: ISVGElementConversion = {
	rect: (rect: SVGRectElement): string => {
		const width: number = parseFloat(rect.getAttribute('width') || '0')
		const height: number = parseFloat(rect.getAttribute('height') || '0')
		const x: number = parseFloat(rect.getAttribute('x') || '0')
		const y: number = parseFloat(rect.getAttribute('y') || '0')
		let rx: number | string = rect.getAttribute('rx') || 'auto'
		let ry: number | string = rect.getAttribute('ry') || 'auto'

		if (rx === 'auto' && ry === 'auto') rx = ry = 0
		else if (rx !== 'auto' && ry === 'auto') rx = ry = fromPercentage(rx, width)
		else if (ry !== 'auto' && rx === 'auto') ry = rx = fromPercentage(ry, height)
		else {
			rx = fromPercentage(rx, width)
			ry = fromPercentage(ry, height)
		}

		if (rx > width / 2) rx = width / 2
		if (ry > height / 2) ry = height / 2

		const hasCurves = rx > 0 && ry > 0

		return [
			`M${x + rx} ${y}`,
			`H${x + width - rx}`,
			...(hasCurves ? [`A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}`] : []),
			`V${y + height - ry}`,
			...(hasCurves ? [`A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}`] : []),
			`H${x + rx}`,
			...(hasCurves ? [`A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}`] : []),
			`V${y + ry}`,
			...(hasCurves ? [`A${rx} ${ry} 0 0 1 ${x + rx} ${y}`] : []),
			'Z',
		].join(' ')
	},

	ellipse: (ellipse: SVGEllipseElement | SVGCircleElement): string => {
		const cx = parseFloat(ellipse.getAttribute('cx') || '0')
		const cy = parseFloat(ellipse.getAttribute('cy') || '0')

		const rx = parseFloat(ellipse.getAttribute('rx') ?? ellipse.getAttribute('r') ?? '0')
		const ry = parseFloat(ellipse.getAttribute('ry') ?? ellipse.getAttribute('r') ?? '0')

		return [
			`M${cx + rx} ${cy}`,
			`A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}`,
			`A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`,
			`A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`,
			'Z',
		].join(' ')
	},

	circle: (circle: SVGCircleElement): string => conversion.ellipse(circle),

	line: (line: SVGLineElement): string =>
		`M${line.getAttribute('x1') || '0'} ${line.getAttribute('y1') || '0'} L${line.getAttribute('x2') || '0'} ${
			line.getAttribute('y2') || '0'
		}`,

	polyline: (polyline: SVGPolylineElement): string => {
		const points = polyline.getAttribute('points') || ''
		const pointsArray = points
			.trim()
			.replace(/  +/g, ' ')
			.split(' ')
			.reduce(
				(arr: Array<string>, point: string) => [...arr, ...(point.includes(',') ? point.split(',') : [point])],
				[]
			)
		const pairs = chunk(pointsArray, 2)

		return pairs.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
	},

	polygon: (polygon: SVGPolygonElement): string => conversion.polyline(polygon) + ' Z',

	path: (path: SVGPathElement): string => path.getAttribute('d') + '',
}

export { conversion }
