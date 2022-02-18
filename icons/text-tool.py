size(100, 100)

try:
    color
except NameError:
    color = 0

lineThickness = 6
margin = 17
lineLength = width() - 2 * margin
vSerif = 0.3 * lineLength
hSerif = 0.22 * lineLength
vOffset = 0.015 * lineLength

stroke(color)
strokeWidth(lineThickness)
lineCap("round")
fill(None)

translate(margin, margin)
line((0, lineLength), (lineLength, lineLength))

for o in [-vOffset, vOffset]:
    line((lineLength / 2 + o, 0), (lineLength / 2 + o, lineLength))


line((lineLength / 2 - hSerif, 0), (lineLength / 2 + hSerif, 0))

for x in [0, lineLength]:
    line((x, lineLength), (x, lineLength - vSerif))
