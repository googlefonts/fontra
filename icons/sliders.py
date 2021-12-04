from random import seed

seed(21)

size(100, 100)

# diameter = 50
# radius = diameter / 2
lineThickness = 6
hMargin = 14
vMargin = 20
numLines = 4
knobRadius = 5

lineLength = width() - 2 * hMargin
lineDist = (height() - 2 * vMargin) / (numLines - 1)
stroke(0)
strokeWidth(lineThickness)
lineCap("round")
fill(None)

translate(hMargin, vMargin)
for i in range(numLines):
    line((0, 0), (lineLength, 0))
    knobX = lineLength * random()
    with savedState():
        translate(knobX, 0)
        oval(-knobRadius, -knobRadius, 2 * knobRadius, 2 * knobRadius)
    translate(0, lineDist)

# handleLength = radius * 1.6

# offset = 15
# translate(radius + offset, height() - radius - offset)
# rotate(-45)

# stroke(0)
# strokeWidth(lineThickness)
# lineCap("round")
# fill(None)

# oval(-radius, -radius, diameter, diameter)
# line((radius, 0), (radius + handleLength, 0))

# strokeWidth(lineThickness * 1.7)
# line((radius * 1.5, 0), (radius + handleLength, 0))
