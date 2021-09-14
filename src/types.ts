import { IDrawerProps } from '@urpflanze/core'
import { IPropArguments, TDrawerProp } from '@urpflanze/core/dist/types'

/**
 *
 */
export interface ISVGParsed {
	viewBox: [number, number, number, number]
	buffers: Array<ISVGParsedPath>
}

export interface ISVGDrawer extends IDrawerProps<IPropArguments> {
	fill?: string
	stroke?: string
	lineWidth?: number
}

/**
 *
 */
export interface ISVGParsedPath {
	buffer: Float32Array
	bClosed: boolean
	drawer: ISVGDrawer
}

/**
 * @internal
 */
export interface ISVGElementConversion {
	rect: (rect: SVGRectElement) => string
	ellipse: (ellipse: SVGEllipseElement | SVGCircleElement) => string
	circle: (circle: SVGCircleElement) => string
	line: (line: SVGLineElement) => string
	polyline: (polyline: SVGPolylineElement) => string
	polygon: (polygon: SVGPolygonElement) => string
	path: (path: SVGPathElement) => string
}
