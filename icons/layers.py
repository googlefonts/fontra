size(100, 100)

try:
    color
except NameError:
    color = 0

lineThickness = 5.2
margin = 9.5

numLayers = 4
layerHeight = 0.44  # relative to width
layerHalfWidth = 50 - margin
layerHalfHeight = layerHalfWidth * layerHeight
layerOffset = 0.88
cutY = layerOffset / 2
cutX = 1 - cutY

bez = BezierPath()
bez.polygon((-1, 0), (0, 1), (1, 0), (0, -1))
for i in range(numLayers - 1):
    bez.translate(0, layerOffset)
    bez.polygon((cutX, cutY), (1, 0), (0, -1), (-1, 0), (-cutX, cutY), close=False)

bez.translate(0, -layerOffset * (numLayers - 1) / 2)
bez.scale(layerHalfWidth, layerHalfHeight)
bez.translate(50, 50)


stroke(color)
strokeWidth(lineThickness)
lineCap("round")
lineJoin("round")
fill(None)

drawPath(bez)