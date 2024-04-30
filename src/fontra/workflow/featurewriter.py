from __future__ import annotations

from dataclasses import dataclass, field

from fontTools.feaLib.variableScalar import VariableScalar

__all__ = ["FeatureWriter", "VariableScalar"]


@dataclass(kw_only=True)
class FeatureWriter:
    languageSystems: list[LanguageSystem] = field(init=False, default_factory=list)
    groups: list[Group] = field(init=False, default_factory=list)
    statements: list[StatementBlock] = field(init=False, default_factory=list)

    def addLanguageSystem(self, script: str, language: str) -> None:
        self.languageSystems.append(LanguageSystem(script=script, language=language))

    def addGroup(self, name, glyphNames):
        self.groups.append(Group(name=name, glyphNames=glyphNames))

    def addLookup(self, name: str) -> StatementBlock:
        return self.addStatementBlock("lookup", name)

    def addFeature(self, name: str) -> StatementBlock:
        return self.addStatementBlock("feature", name)

    def addStatementBlock(self, statementType: str, name: str) -> StatementBlock:
        block = StatementBlock(statementType=statementType, name=name)
        self.statements.append(block)
        return block

    def asFea(self) -> str:
        lines: list[str] = []

        lines.extend(ls.asFea() for ls in self.languageSystems)
        if self.languageSystems:
            lines.append("")

        lines.extend(grp.asFea() for grp in self.groups)
        if self.groups:
            lines.append("")

        for stmnt in self.statements:
            lines.append(stmnt.asFea())
            lines.append("")

        if lines and lines[-1]:
            lines.append("")

        return "\n".join(lines)


@dataclass(kw_only=True)
class StatementBlock:
    statementType: str
    name: str
    lines: list[str] = field(init=False, default_factory=list)

    def addLine(self, line: str, addSemiColon=True) -> None:
        semiColon = ";" if addSemiColon else ""
        self.lines.append(f"    {line}{semiColon}")

    def asFea(self) -> str:
        lines = []
        lines.append(f"{self.statementType} {self.name} {{")
        lines.extend(self.lines)
        lines.append(f"}} {self.name};")
        return "\n".join(line for line in lines)


@dataclass(kw_only=True)
class LanguageSystem:
    script: str
    language: str

    def asFea(self) -> str:
        return f"languagesystem {self.script} {self.language};"


@dataclass(kw_only=True)
class Group:
    name: str
    glyphNames: list[str]

    def asFea(self) -> str:
        glyphNamesString = " ".join(self.glyphNames)
        return f"@{self.name} = [{glyphNamesString}];"
