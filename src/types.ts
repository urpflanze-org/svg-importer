import { IPropArguments, TDrawerProp } from '@urpflanze/core'

/**
 *
 */
export interface ISVGParsed {
	viewBox: [number, number, number, number]
	buffers: Array<ISVGParsedPath>
}

export interface ISVGDrawer {
	fill?: TDrawerProp<string, IPropArguments>
	stroke?: TDrawerProp<string, IPropArguments>
	lineWidth?: TDrawerProp<number, IPropArguments>
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
