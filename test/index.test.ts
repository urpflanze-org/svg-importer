import tap from 'tap'

import { ShapeBuffer } from '@urpflanze/core'
import { SVGImporter } from '../dist/cjs'

const shape = SVGImporter.parse(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M0 0 L200 0 L200 200 L0 200 Z" /></svg> `,
	0.1,
	10
) as ShapeBuffer

shape.generate(0)

tap.deepEqual(
	shape.getBounding(),
	{
		cx: 0,
		cy: 0,
		x: -10,
		y: -10,
		width: 20,
		height: 20,
	},
	'check bounding'
)

tap.deepEqual(shape.getBuffer(), [-10, -10, 10, -10, 10, 10, -10, 10], 'check buffer')

////

const shape2 = SVGImporter.parse(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="scale(0.5 0.5)"><path d="M0 0 L200 0 L200 200 L0 200 Z" /></g></svg> `,
	0.1,
	10
) as ShapeBuffer

shape2.generate(0)
console.log(shape2.getBuffer())
tap.deepEqual(shape2.getBuffer(), [-10, -10, 0, -10, 0, 0, -10, 0], 'test group transform')

////

const shape3 = SVGImporter.parse(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="scale(0.5 0.5)"><path transform="translate(100 100) scale(0.5 0.5)" d="M0 0 L200 0 L200 200 L0 200 Z" /></g></svg> `,
	0.1,
	10
) as ShapeBuffer

shape3.generate(0)
tap.deepEqual(shape3.getBuffer(), [-5, -5, 0, -5, 0, 0, -5, 0], 'test group and element transform')

////

const shape4 = SVGImporter.parse(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="red" opacity=".5" d="M0 0 L200 0 L200 200 L0 200 Z" /></svg> `,
	0.1,
	10
) as ShapeBuffer

shape4.generate(0)
tap.deepEqual(shape4.drawer.fill, 'rgba(255, 0, 0, 0.5)', 'test fill color and opacity')
