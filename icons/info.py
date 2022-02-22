size(100, 100)

try:
    color
except NameError:
    color = 0

lineThickness = 6
margin = 17
lineLength = width() - 2 * margin
xHeight = lineLength * 0.72
hSerif = 0.34 * lineLength
vOffset = 0.015 * lineLength

stroke(color)
strokeWidth(lineThickness)
lineCap("round")
fill(None)

translate(margin + 0.5, margin + 1)
line((lineLength / 2 - hSerif, xHeight), (lineLength / 2, xHeight))

for o in [-vOffset, vOffset]:
    line((lineLength / 2 + o, 0), (lineLength / 2 + o, xHeight))


line((lineLength / 2 - hSerif, 0), (lineLength / 2 + hSerif, 0))

oval((lineLength - lineThickness) / 2 - 0.05 * lineThickness, lineLength - 0.5 * lineThickness, lineThickness, lineThickness)