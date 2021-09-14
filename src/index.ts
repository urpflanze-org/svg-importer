import { createSVGWindow } from 'svgdom'
import { registerWindow } from '@svgdotjs/svg.js'

import { SVGImporter } from './SVGImporter'
export * from './types'

const window = createSVGWindow()
registerWindow(window, window.document)

SVGImporter.setWindowInstance(window)

export { SVGImporter }
export default SVGImporter
