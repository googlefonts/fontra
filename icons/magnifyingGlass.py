size(100, 100)

diameter = 50
radius = diameter / 2
lineThickness = 6
handleLength = radius * 1.6

offset = 13
translate(radius + offset, height() - radius - offset)
rotate(-45)

stroke(0)
strokeWidth(lineThickness)
lineCap("round")
fill(None)

oval(-radius, -radius, diameter, diameter)
line((radius, 0), (radius + handleLength, 0))

strokeWidth(lineThickness * 1.7)
line((radius * 1.5, 0), (radius + handleLength, 0))
