size(100, 100)

diameter = 57
radius = diameter / 2
innerScale = 0.66
lineThickness = 6
handleLength = radius * 0.47

offset = 15
translate(50, 50)

stroke(0)
strokeWidth(lineThickness)
lineCap("round")
fill(None)

with savedState():
    for i in range(4):
        line((radius, 0), (radius + handleLength, 0))
        rotate(90)

oval(-radius, -radius, diameter, diameter)
stroke(None)
fill(0)
scale(innerScale)
oval(-radius, -radius, diameter, diameter)
