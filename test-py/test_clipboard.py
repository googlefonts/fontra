import pytest

from fontra.core.classes import StaticGlyph
from fontra.core.clipboard import parseClipboard, serializeStaticGlyphAsGLIF
from fontra.core.path import ContourInfo, PackedPath, PointType


@pytest.mark.parametrize(
    "inputData, expectedResult",
    [
        ("dasasdad", None),  # unparsable
        ("<svg xxxx", None),  # unparsable
        ("<?xml xxxx <glyph ", None),  # unparsable
        (
            '<svg xmlns="http://www.w3.org/2000/svg" width="50" '
            'height="120" viewBox="60 0 50 120">'
            '<path transform="matrix(1 0 0 -1 0 120)" '
            'd="M60,0L110,0L110,120L60,120L60,0Z"/>'
            "</svg>",
            StaticGlyph(
                path=PackedPath(
                    coordinates=[60.0, 0.0, 110.0, 0.0, 110.0, 120.0, 60.0, 120.0],
                    pointTypes=[
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                    ],
                    contourInfo=[ContourInfo(endPoint=3, isClosed=True)],
                ),
                xAdvance=110.0,
            ),
        ),
        (
            '<svg xmlns="http://www.w3.org/2000/svg" width="50" '
            'height="120" viewBox="60 0 50 120">'
            "</svg>",
            None,
        ),
        (
            "<?xml version='1.0' encoding='UTF-8'?>"
            '<glyph name="period" format="2">'
            '  <advance width="170"/>'
            '  <unicode hex="002E"/>'
            "  <outline>"
            "    <contour>"
            '      <point x="60" y="0" type="line"/>'
            '      <point x="110" y="0" type="line"/>'
            '      <point x="110" y="120" type="line"/>'
            '      <point x="60" y="120" type="line"/>'
            "    </contour>"
            "  </outline>"
            "</glyph>",
            StaticGlyph(
                path=PackedPath(
                    coordinates=[60, 0, 110, 0, 110, 120, 60, 120],
                    pointTypes=[
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                    ],
                    contourInfo=[ContourInfo(endPoint=3, isClosed=True)],
                ),
                components=[],
                xAdvance=170,
                yAdvance=None,
                verticalOrigin=None,
            ),
        ),
    ],
)
def test_parseClipboard(inputData: str, expectedResult: StaticGlyph):
    result: StaticGlyph | None = parseClipboard(inputData)
    assert expectedResult == result


@pytest.mark.parametrize(
    "glyphName, glyph, unicodes, expectedResult",
    [
        (
            "period",
            StaticGlyph(
                path=PackedPath(
                    coordinates=[60, 0, 110, 0, 110, 120, 60, 120],
                    pointTypes=[
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                        PointType.ON_CURVE,
                    ],
                    contourInfo=[ContourInfo(endPoint=3, isClosed=True)],
                ),
                components=[],
                xAdvance=170,
                yAdvance=None,
                verticalOrigin=None,
            ),
            [0x002E],
            "<?xml version='1.0' encoding='UTF-8'?>\n"
            '<glyph name="period" format="2">\n'
            '  <advance width="170"/>\n'
            '  <unicode hex="002E"/>\n'
            "  <outline>\n"
            "    <contour>\n"
            '      <point x="60" y="0" type="line"/>\n'
            '      <point x="110" y="0" type="line"/>\n'
            '      <point x="110" y="120" type="line"/>\n'
            '      <point x="60" y="120" type="line"/>\n'
            "    </contour>\n"
            "  </outline>\n"
            "</glyph>\n",
        ),
    ],
)
def test_serializeStaticGlyphAsGLIF(
    glyphName: str, glyph: StaticGlyph, unicodes: list[int], expectedResult: str
):
    result: str = serializeStaticGlyphAsGLIF(glyphName, glyph, unicodes)
    assert expectedResult == result
