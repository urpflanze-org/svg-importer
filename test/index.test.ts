import { ShapeBuffer } from '@urpflanze/core'
import tap from 'tap'

const SVGImporter = require('../dist/index').SVGImporter

const shape = SVGImporter.parse(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#ffffff" />
    <path d="M50.000 50.000 L150.000 50.000 L150.000 150.000 L50.000 150.000 Z" fill="none" stroke="#000000" stroke-width="1" />
</svg> 
`) as ShapeBuffer

shape.generate(0)

tap.deepEqual(shape.getBuffer(), [50.0, 50.0, 150.0, 50.0, 150.0, 150.0, 50.0, 150.0], 'default')
