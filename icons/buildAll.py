import pathlib

thisPath = pathlib.Path(__file__).resolve()
thisFolder = thisPath.parent
imagesFolder = thisFolder.parent / "client" / "images"

imagesFolder.mkdir(exist_ok=True)

for p in thisFolder.glob("*.py"):
    if p.name == thisPath.name:
        continue
    src = p.read_text()
    newDrawing()
    exec(src)
    saveImage(imagesFolder / (p.stem + ".svg"))
    endDrawing()
