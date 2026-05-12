from __future__ import annotations

from html import escape
from io import BytesIO
from typing import Any
from zipfile import ZipFile

from .docx import replace_docx_entries

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml"
DOCUMENT_PREFIX = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
"""
DOCUMENT_SUFFIX = """
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>
"""
HEADER_PREFIX = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="{WORD_NS}" xmlns:w14="{W14_NS}">
"""
HEADER_SUFFIX = """
</w:hdr>
"""
PR = 'w:rsidR="00035852" w:rsidRDefault="001652D9"'
PR0 = 'w:rsidR="00035852" w:rsidRDefault="00035852"'
BDR = (
    '<w:pBdr><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
    '<w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr>'
)
EXPERIENCE_SECTION_KEYS = {"experience", "selectedExperience", "additionalExperience"}
SECT_PR = """    <w:sectPr w:rsidR="00035852" w:rsidRPr="00633E15">
      <w:headerReference w:type="even" r:id="rId7"/>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId9"/>
      <w:pgSz w:w="12242" w:h="15842"/>
      <w:pgMar w:top="83" w:right="992" w:bottom="567" w:left="1134" w:header="120" w:footer="555" w:gutter="0"/>
      <w:pgNumType w:start="1"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>"""


class ParaIds:
    def __init__(self) -> None:
        self.value = 0x40000000

    def next(self) -> str:
        current = self.value
        self.value += 1
        return f"{current:08X}"


def _is_xml_10_char(ch: str) -> bool:
    codepoint = ord(ch)
    return (
        codepoint in {0x9, 0xA, 0xD}
        or 0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def _escape_xml_text(text: str) -> str:
    return escape("".join(ch for ch in str(text) if _is_xml_10_char(ch)))


def _p(text: str, *, bold: bool = False, ids: ParaIds | None = None) -> str:
    b = "<w:b/><w:bCs/>" if bold else ""
    pid = f' w14:paraId="{ids.next()}"' if ids else ""
    return (
        f"    <w:p{pid}>"
        f"<w:r><w:rPr>{b}</w:rPr><w:t>{_escape_xml_text(text)}</w:t></w:r>"
        "</w:p>"
    )


def _section(label: str, ids: ParaIds | None = None) -> str:
    return _p(label, bold=True, ids=ids)


def _font_run(font: str) -> str:
    safe = _escape_xml_text(font)
    return f'<w:rFonts w:ascii="{safe}" w:eastAsia="{safe}" w:hAnsi="{safe}" w:cs="{safe}"/>'


def _normalize_color(value: str | int | None, fallback: str) -> str:
    if isinstance(value, int):
        return f"{value:06X}"[-6:]
    if not isinstance(value, str):
        return fallback
    normalized = value.strip().removeprefix("#").upper()
    if len(normalized) == 6 and all(ch in "0123456789ABCDEF" for ch in normalized):
        return normalized
    return fallback


def _read_token_number(value: str | int | None, fallback: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value, 10)
        except ValueError:
            return fallback
    return fallback


def _read_token_string(value: str | int | None, fallback: str) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else fallback


def _resolve_template_style(contract: dict[str, Any]) -> dict[str, Any]:
    style_tokens = contract["styleTokens"]
    colors = style_tokens["colors"]
    fonts = style_tokens["fonts"]
    spacing = style_tokens["spacing"]
    return {
        "headingFont": _read_token_string(fonts.get("heading"), "Cambria"),
        "bodyFont": _read_token_string(fonts.get("body"), "Cambria"),
        "accentColor": _normalize_color(colors.get("accent"), "7030A0"),
        "sectionBannerFill": _normalize_color(colors.get("sectionBannerFill"), "E6E6E6"),
        "sectionBannerText": _normalize_color(colors.get("sectionBannerText"), "1F2937"),
        "bodyText": _normalize_color(colors.get("bodyText"), "000000"),
        "mutedText": _normalize_color(colors.get("mutedText"), "5B6470"),
        "headerStyle": contract["rendering"]["headerStyle"],
        "sectionStyle": contract["rendering"]["sectionStyle"],
        "jobStyle": contract["rendering"]["jobStyle"],
        "sectionBeforeTwip": _read_token_number(spacing.get("sectionBeforeTwip"), 240),
        "sectionAfterTwip": _read_token_number(spacing.get("sectionAfterTwip"), 240),
        "lineTwip": _read_token_number(spacing.get("lineTwip"), 300),
    }


def _section_header(title: str, style: dict[str, Any], ids: ParaIds) -> str:
    font = _font_run(style["headingFont"])
    title = _escape_xml_text(title)
    if style["sectionStyle"] != "left-accent":
        return _section(title, ids=ids)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        '<w:pPr><w:widowControl w:val="0"/>'
        f'<w:pBdr><w:left w:val="single" w:sz="16" w:space="6" w:color="{style["accentColor"]}"/></w:pBdr>'
        f'<w:spacing w:before="{style["sectionBeforeTwip"]}" w:after="{style["sectionAfterTwip"]}" '
        f'w:line="{style["lineTwip"]}" w:lineRule="auto"/>'
        '<w:ind w:left="120"/><w:jc w:val="left"/>'
        f'<w:rPr>{font}<w:b/><w:bCs/><w:caps/><w:color w:val="{style["sectionBannerText"]}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{font}<w:b/><w:bCs/><w:caps/><w:color w:val="{style["sectionBannerText"]}"/></w:rPr>'
        f"<w:t>{title}</w:t></w:r></w:p>"
    )


def _skill_bullet(label: str, description: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    label_color = style["bodyText"] if style["jobStyle"] == "ats-plain" else style["accentColor"]
    if style["jobStyle"] == "compact-dense":
        label_text = _escape_xml_text(label.rstrip().removesuffix(":"))
        description_text = _escape_xml_text(description)
        return (
            f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
            f'<w:pPr><w:widowControl w:val="0"/>{BDR}<w:spacing w:after="6" '
            f'w:line="{max(220, style["lineTwip"] - 20)}" w:lineRule="auto"/>'
            f'<w:rPr>{body_font}<w:color w:val="{label_color}"/><w:b/><w:bCs/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:pPr>'
            f'<w:r><w:rPr>{body_font}<w:color w:val="{label_color}"/><w:b/><w:bCs/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>'
            f"<w:t>{label_text}</w:t></w:r>"
            "</w:p>"
            f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
            f'<w:pPr><w:widowControl w:val="0"/>{BDR}<w:spacing w:after="34" '
            f'w:line="{max(220, style["lineTwip"] - 10)}" w:lineRule="auto"/>'
            f'<w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:pPr>'
            f'<w:r><w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>'
            f"<w:t>{description_text}</w:t></w:r>"
            "</w:p>"
        )
    return _p(f"{label}: {description}", ids=ids)


def _sector_category(label: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    label = _escape_xml_text(label)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:before="52" w:after="14" w:line="{max(170, style["lineTwip"] - 110)}" w:lineRule="auto"/>'
        f'<w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{style["sectionBannerText"]}"/><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{style["sectionBannerText"]}"/><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr>'
        f"<w:t>{label}</w:t></w:r></w:p>"
    )


def _sector_item(text: str, style: dict[str, Any], ids: ParaIds, page_break: bool = False) -> str:
    body_font = _font_run(style["bodyFont"])
    pb = '<w:r><w:br w:type="page"/></w:r>' if page_break else ""
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        '<w:ind w:left="150"/>'
        f'<w:spacing w:after="10" w:line="{max(165, style["lineTwip"] - 115)}" w:lineRule="auto"/>'
        f'<w:rPr>{body_font}<w:color w:val="{style["mutedText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:color w:val="{style["accentColor"]}"/><w:sz w:val="10"/><w:szCs w:val="10"/></w:rPr><w:t>\u2022</w:t></w:r>'
        f'<w:r><w:rPr>{body_font}<w:color w:val="{style["mutedText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>'
        f'<w:t xml:space="preserve"> {text}</w:t></w:r>{pb}</w:p>'
    )


def _spacer(style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    line = max(170, style["lineTwip"] - 90) if style["jobStyle"] == "compact-dense" else style["lineTwip"]
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR0}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:line="{line}" w:lineRule="auto"/>'
        '<w:jc w:val="both"/>'
        f"<w:rPr>{body_font}</w:rPr></w:pPr></w:p>"
    )


def _empty_para(ids: ParaIds) -> str:
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR0}>'
        '<w:pPr><w:tabs><w:tab w:val="left" w:pos="1620"/><w:tab w:val="center" w:pos="5058"/></w:tabs></w:pPr></w:p>'
    )


def _job_company(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    color = style["bodyText"] if style["jobStyle"] == "ats-plain" else style["accentColor"]
    size = 18 if style["jobStyle"] == "compact-dense" else 24
    after = 12 if style["jobStyle"] == "compact-dense" else 0
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:after="{after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/><w:jc w:val="both"/>'
        f'<w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f"<w:t>{text}</w:t></w:r></w:p>"
    )


def _job_description(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    color = style["accentColor"] if style["jobStyle"] == "modern-emphasis" else style["mutedText"]
    is_bold = style["jobStyle"] == "modern-emphasis"
    bold = "<w:b/><w:bCs/>" if is_bold else ""
    size = 12 if style["jobStyle"] == "compact-dense" else 22
    after = 12 if style["jobStyle"] == "compact-dense" else 0
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:after="{after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/><w:jc w:val="both"/>'
        f'<w:rPr>{body_font}{bold}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}{bold}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f"<w:t>{text}</w:t></w:r></w:p>"
    )


def _job_dates(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    color = style["mutedText"] if style["jobStyle"] == "ats-plain" else style["accentColor"]
    bold = "" if style["jobStyle"] == "ats-plain" else "<w:b/><w:bCs/>"
    size = 12 if style["jobStyle"] == "compact-dense" else 20
    after = 10 if style["jobStyle"] == "compact-dense" else 0
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:after="{after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/><w:jc w:val="both"/>'
        f'<w:rPr>{body_font}{bold}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}{bold}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f"<w:t>{text}</w:t></w:r></w:p>"
    )


def _job_title(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    color = style["bodyText"] if style["jobStyle"] == "classic-consulting" else style["accentColor"]
    size = 14 if style["jobStyle"] == "compact-dense" else 22
    after = 12 if style["jobStyle"] == "compact-dense" else 0
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:after="{after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/><w:jc w:val="both"/>'
        f'<w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f"<w:t>{text}</w:t></w:r></w:p>"
    )


def _label_para(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    size = 12 if style["jobStyle"] == "compact-dense" else 22
    before_after = 18 if style["jobStyle"] == "compact-dense" else 24
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        '<w:ind w:right="-57"/>'
        f'<w:spacing w:before="{before_after}" w:after="{before_after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/>'
        f'<w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{style["bodyText"]}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f"<w:t>{text}</w:t></w:r></w:p>"
    )


def _bullet_item(text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    text_size = 12 if style["jobStyle"] == "compact-dense" else 22
    bullet_size = 10 if style["jobStyle"] == "compact-dense" else 18
    compact_indent = 430
    text = _escape_xml_text(text)
    if style["jobStyle"] == "compact-dense":
        indent = (
            f'<w:tabs><w:tab w:val="left" w:pos="{compact_indent}"/></w:tabs>'
            f'<w:ind w:left="{compact_indent}" w:hanging="{compact_indent}" w:right="-57"/>'
        )
        text_run = (
            f'<w:r><w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{text_size}"/><w:szCs w:val="{text_size}"/></w:rPr>'
            f"<w:tab/><w:t>{text}</w:t></w:r>"
        )
    else:
        indent = '<w:ind w:left="520" w:hanging="240" w:right="-57"/>'
        text_run = (
            f'<w:r><w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{text_size}"/><w:szCs w:val="{text_size}"/></w:rPr>'
            f'<w:t xml:space="preserve"> {text}</w:t></w:r>'
        )
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}{indent}'
        f'<w:spacing w:after="{14 if style["jobStyle"] == "compact-dense" else 32}" '
        f'w:line="{190 if style["jobStyle"] == "compact-dense" else style["lineTwip"]}" w:lineRule="auto"/>'
        f'<w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{text_size}"/><w:szCs w:val="{text_size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:color w:val="{style["accentColor"]}"/><w:sz w:val="{bullet_size}"/><w:szCs w:val="{bullet_size}"/></w:rPr><w:t>\u2022</w:t></w:r>'
        f"{text_run}</w:p>"
    )


def _tech_env_para(label: str, text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    label_size = 12 if style["jobStyle"] == "compact-dense" else 22
    text_size = 12 if style["jobStyle"] == "compact-dense" else 22
    before = 12 if style["jobStyle"] == "compact-dense" else 18
    after = 22 if style["jobStyle"] == "compact-dense" else 18
    label = _escape_xml_text(label)
    text = _escape_xml_text(text)
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        f'<w:pPr><w:widowControl w:val="0"/>{BDR}'
        f'<w:spacing w:before="{before}" w:after="{after}" w:line="{style["lineTwip"]}" w:lineRule="auto"/>'
        '<w:ind w:right="-57"/>'
        f'<w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{text_size}"/><w:szCs w:val="{text_size}"/></w:rPr>'
        '</w:pPr>'
        f'<w:r><w:rPr>{body_font}<w:b/><w:bCs/><w:color w:val="{style["bodyText"]}"/><w:sz w:val="{label_size}"/><w:szCs w:val="{label_size}"/></w:rPr>'
        f"<w:t>{label}</w:t></w:r>"
        f'<w:r><w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="{text_size}"/><w:szCs w:val="{text_size}"/></w:rPr>'
        f'<w:t xml:space="preserve"> {text}</w:t></w:r></w:p>'
    )


def _education_line(year: str, text: str, style: dict[str, Any], ids: ParaIds) -> str:
    body_font = _font_run(style["bodyFont"])
    year = _escape_xml_text(year)
    text = _escape_xml_text(text)
    if style["jobStyle"] == "compact-dense":
        return (
            f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
            f'<w:pPr><w:widowControl w:val="0"/>{BDR}<w:spacing w:before="14" w:after="2" '
            f'w:line="{max(165, style["lineTwip"] - 115)}" w:lineRule="auto"/>'
            f'<w:rPr>{body_font}<w:color w:val="{style["accentColor"]}"/><w:sz w:val="13"/><w:szCs w:val="13"/></w:rPr></w:pPr>'
            f'<w:r><w:rPr>{body_font}<w:color w:val="{style["accentColor"]}"/><w:sz w:val="13"/><w:szCs w:val="13"/></w:rPr><w:t>{year}</w:t></w:r>'
            "</w:p>"
            f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
            f'<w:pPr><w:widowControl w:val="0"/>{BDR}<w:spacing w:after="16" '
            f'w:line="{max(165, style["lineTwip"] - 110)}" w:lineRule="auto"/>'
            f'<w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:pPr>'
            f'<w:r><w:rPr>{body_font}<w:color w:val="{style["bodyText"]}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t>{text}</w:t></w:r>'
            "</w:p>"
        )
    return _p(f"{year}: {text}", ids=ids)


def _job_entry(job: dict[str, Any], style: dict[str, Any], ids: ParaIds) -> list[str]:
    parts = [
        _job_company(job["company"], style, ids),
        _job_description(job["description"], style, ids),
        _job_dates(job["dates"], style, ids),
        _spacer(style, ids),
        _job_title(job["title"], style, ids),
        _spacer(style, ids),
        _label_para("Tasks:", style, ids),
    ]
    parts.extend(_bullet_item(task, style, ids) for task in job.get("tasks", []))
    achievements = job.get("achievements", [])
    if achievements:
        parts.append(_label_para("Achievements:", style, ids))
        parts.extend(_bullet_item(achievement, style, ids) for achievement in achievements)
    parts.append(_tech_env_para("Technical Environment:", job.get("techEnvironment", ""), style, ids))
    parts.append(_spacer(style, ids))
    return parts


def _render_skills_section(section: dict[str, Any], items: list[dict[str, Any]], style: dict[str, Any], ids: ParaIds) -> list[str]:
    if not items:
        return []
    return [_section_header(section["label"], style, ids), *[_skill_bullet(skill["label"], skill["description"], style, ids) for skill in items[:7]]]


def _render_sector_section(
    section: dict[str, Any],
    sectors: list[str],
    domains: list[str],
    style: dict[str, Any],
    ids: ParaIds,
    add_page_break: bool,
) -> list[str]:
    if not sectors and not domains:
        return []
    paragraphs = [_section_header(section["label"], style, ids)]
    groups: list[tuple[str, list[str]]] = []
    if sectors:
        groups.append(("Sectors", sectors))
    if domains:
        groups.append(("Domains", domains))
    for group_index, (label, values) in enumerate(groups):
        paragraphs.append(_sector_category(label, style, ids))
        for value_index, value in enumerate(values):
            is_last_group = group_index == len(groups) - 1
            is_last_value = value_index == len(values) - 1
            paragraphs.append(_sector_item(value, style, ids, add_page_break and is_last_group and is_last_value))
    return paragraphs


def _render_experience_section(section: dict[str, Any], jobs: list[dict[str, Any]], style: dict[str, Any], ids: ParaIds) -> list[str]:
    if not jobs:
        return []
    paragraphs = [_section_header(section["label"], style, ids), _empty_para(ids)]
    for job in jobs:
        paragraphs.extend(_job_entry(job, style, ids))
    return paragraphs


def _render_languages_section(section: dict[str, Any], languages: list[dict[str, Any]], style: dict[str, Any], ids: ParaIds) -> list[str]:
    if not languages:
        return []
    return [_section_header(section["label"], style, ids), *[_skill_bullet(language["label"], language["level"], style, ids) for language in languages]]


def _render_education_section(section: dict[str, Any], education: list[dict[str, Any]], style: dict[str, Any], ids: ParaIds) -> list[str]:
    if not education:
        return []
    return [_section_header(section["label"], style, ids), *[_education_line(entry["year"], entry["description"], style, ids) for entry in education]]


def _render_section_paragraphs(
    section: dict[str, Any],
    profile: dict[str, Any],
    style: dict[str, Any],
    ids: ParaIds,
    selected_jobs: list[dict[str, Any]],
    additional_jobs: list[dict[str, Any]],
    next_has_experience: bool,
) -> list[str]:
    key = section["key"]
    if key in {"technicalSkills", "coreSkills"}:
        return _render_skills_section(section, profile.get("technicalSkills", []), style, ids)
    if key in {"sectorSkills", "sectorExperience"}:
        return _render_sector_section(section, profile.get("sectors", []), profile.get("domains", []), style, ids, next_has_experience)
    if key == "experience":
        return _render_experience_section(section, profile.get("experience", []), style, ids)
    if key == "selectedExperience":
        return _render_experience_section(section, selected_jobs, style, ids)
    if key == "additionalExperience":
        return _render_experience_section(section, additional_jobs, style, ids)
    if key == "languages":
        return _render_languages_section(section, profile.get("languages", []), style, ids)
    if key == "education":
        return _render_education_section(section, profile.get("education", []), style, ids)
    if key in {"executiveSummary", "tools"} and not section.get("required"):
        return []
    raise ValueError(f"Unhandled template section: {key}")


def _build_cell_margins(top: int = 180, right: int = 180, bottom: int = 180, left: int = 180) -> str:
    return (
        "<w:tcMar>"
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        "</w:tcMar>"
    )


def _build_table_cell(
    paragraphs: list[str],
    *,
    width: int,
    grid_span: int | None = None,
    shading_fill: str | None = None,
    margins: str | None = None,
) -> str:
    return (
        "<w:tc>"
        "<w:tcPr>"
        f'<w:tcW w:w="{width}" w:type="dxa"/>'
        + (f'<w:gridSpan w:val="{grid_span}"/>' if grid_span else "")
        + '<w:vAlign w:val="top"/>'
        + (f'<w:shd w:val="clear" w:color="auto" w:fill="{shading_fill}"/>' if shading_fill else "")
        + (margins or _build_cell_margins())
        + "</w:tcPr>"
        + "".join(paragraphs)
        + "</w:tc>"
    )


def _build_header_paragraph(
    *,
    text: str,
    font: str,
    color: str,
    size: int,
    ids: ParaIds,
    align: str = "left",
    bold: bool = False,
    small_caps: bool = False,
    after: int = 0,
) -> str:
    font_run = _font_run(font)
    b = "<w:b/><w:bCs/>" if bold else ""
    sc = "<w:smallCaps/>" if small_caps else ""
    text = _escape_xml_text(text or " ")
    return (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        "<w:pPr><w:widowControl w:val=\"0\"/>"
        f'<w:spacing w:before="0" w:after="{after}"/>'
        f'<w:jc w:val="{align}"/>'
        f'<w:rPr>{font_run}{b}{sc}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        "</w:pPr>"
        f'<w:r><w:rPr>{font_run}{b}{sc}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
        f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p>'
    )


def _document_xml_header(base_docx: bytes) -> str:
    with ZipFile(BytesIO(base_docx)) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
    idx = xml.index("<w:body>")
    return xml[:idx] + "<w:body>\n"


def _build_brand_accent_document_xml(base_docx: bytes, profile: dict[str, Any], contract: dict[str, Any]) -> str:
    style = _resolve_template_style(contract)
    ids = ParaIds()
    selected_jobs = profile.get("experience", [])[:2]
    additional_jobs = profile.get("experience", [])[2:]
    left_paragraphs: list[str] = []
    right_paragraphs: list[str] = []
    band_paragraphs = [
        _build_header_paragraph(text=profile["name"], font=style["headingFont"], color="FFFFFF", size=34, bold=True, after=18, ids=ids),
        _build_header_paragraph(
            text=" | ".join(value for value in [profile.get("title_line1", ""), profile.get("title_line2", "")] if value),
            font=style["bodyFont"],
            color="FFFFFF",
            size=19,
            after=18,
            ids=ids,
        ),
        _build_header_paragraph(
            text=f'{profile.get("years")} years of experience' if profile.get("years") else " ",
            font=style["bodyFont"],
            color="D8E2EE",
            size=17,
            small_caps=True,
            after=12,
            ids=ids,
        ),
    ]

    for section in contract["sections"]:
        rendered = _render_section_paragraphs(section, profile, style, ids, selected_jobs, additional_jobs, False)
        if not rendered:
            continue
        if section["key"] in EXPERIENCE_SECTION_KEYS:
            right_paragraphs.extend(rendered)
        else:
            left_paragraphs.extend(rendered)

    table = (
        "    <w:tbl>"
        '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>'
        '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
        "</w:tblPr>"
        '<w:tblGrid><w:gridCol w:w="2600"/><w:gridCol w:w="7500"/></w:tblGrid>'
        "<w:tr>"
        + _build_table_cell(
            band_paragraphs,
            width=10100,
            grid_span=2,
            shading_fill=style["accentColor"],
            margins=_build_cell_margins(260, 260, 220, 260),
        )
        + "</w:tr>"
        "<w:tr>"
        + _build_table_cell(
            left_paragraphs,
            width=2600,
            shading_fill=style["sectionBannerFill"],
            margins=_build_cell_margins(220, 180, 220, 220),
        )
        + _build_table_cell(
            right_paragraphs,
            width=7500,
            margins=_build_cell_margins(220, 260, 220, 320),
        )
        + "</w:tr></w:tbl>"
    )
    return _document_xml_header(base_docx) + table + "\n" + SECT_PR


def _render_profile(profile: dict[str, Any], contract: dict[str, Any]) -> str:
    ids = ParaIds()
    parts: list[str] = [
        _p(profile["name"], bold=True, ids=ids),
        _p(profile.get("title_line1", ""), ids=ids),
        _p(profile.get("title_line2", ""), ids=ids),
        _p(str(profile.get("years", "")), ids=ids),
    ]
    labels = {section["key"]: section["label"] for section in contract["sections"]}

    if "technicalSkills" in labels:
        parts.append(_section(labels["technicalSkills"], ids=ids))
        for skill in profile.get("technicalSkills", []):
            parts.append(_p(f'{skill["label"]}: {skill["description"]}', ids=ids))

    if "sectorSkills" in labels:
        parts.append(_section(labels["sectorSkills"], ids=ids))
        for sector in profile.get("sectors", []):
            parts.append(_p(sector, ids=ids))
        for domain in profile.get("domains", []):
            parts.append(_p(domain, ids=ids))

    if "experience" in labels:
        parts.append(_section(labels["experience"], ids=ids))
        for job in profile.get("experience", []):
            parts.append(_p(job["company"], bold=True, ids=ids))
            parts.append(_p(job["title"], ids=ids))
            parts.append(_p(job["dates"], ids=ids))
            parts.append(_p(job["description"], ids=ids))
            for task in job.get("tasks", []):
                parts.append(_p(task, ids=ids))
            if job.get("techEnvironment"):
                parts.append(_p(job["techEnvironment"], ids=ids))

    if "languages" in labels:
        parts.append(_section(labels["languages"], ids=ids))
        for language in profile.get("languages", []):
            parts.append(_p(f'{language["label"]}: {language["level"]}', ids=ids))

    if "education" in labels:
        parts.append(_section(labels["education"], ids=ids))
        for education in profile.get("education", []):
            parts.append(_p(f'{education["year"]}: {education["description"]}', ids=ids))

    return DOCUMENT_PREFIX + "\n".join(parts) + DOCUMENT_SUFFIX


def _header_xml(profile: dict[str, Any]) -> bytes:
    ids = ParaIds()
    xml = HEADER_PREFIX + "\n".join(
        [
            _p(profile["name"], bold=True, ids=ids),
            _p(profile.get("title_line1", ""), ids=ids),
            _p(profile.get("title_line2", ""), ids=ids),
            _p(str(profile.get("years", "")), ids=ids),
        ]
    ) + HEADER_SUFFIX
    return xml.encode("utf-8")


def _story_wrapper(xml: str, tag_name: str) -> tuple[str, str]:
    open_index = xml.index(f"<{tag_name}")
    close_index = xml.rindex(f"</{tag_name}>")
    opening_end = xml.index(">", open_index)
    return xml[: opening_end + 1], xml[close_index:]


def _empty_story_xml(existing_xml: bytes, tag_name: str) -> bytes:
    opening, closing = _story_wrapper(existing_xml.decode("utf-8"), tag_name)
    ids = ParaIds()
    paragraph = (
        f'    <w:p w14:paraId="{ids.next()}" w14:textId="77777777" {PR}>'
        '<w:pPr><w:widowControl w:val="0"/></w:pPr>'
        '<w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>'
    )
    return f"{opening}{paragraph}{closing}".encode("utf-8")


def render_docx(base_docx: bytes, profile: dict[str, Any], contract: dict[str, Any]) -> bytes:
    if contract.get("layout", {}).get("variant") == "brand-accent":
        document = _build_brand_accent_document_xml(base_docx, profile, contract).encode("utf-8")
    else:
        document = _render_profile(profile, contract).encode("utf-8")
    replacements = {"word/document.xml": document}
    with ZipFile(BytesIO(base_docx)) as zf:
        names = set(zf.namelist())
        if contract.get("layout", {}).get("variant") == "brand-accent":
            if "word/header2.xml" in names:
                replacements["word/header2.xml"] = _empty_story_xml(zf.read("word/header2.xml"), "w:hdr")
            if "word/header1.xml" in names:
                replacements["word/header1.xml"] = _empty_story_xml(zf.read("word/header1.xml"), "w:hdr")
            return replace_docx_entries(base_docx, replacements)
    if "word/header2.xml" in names:
        replacements["word/header2.xml"] = _header_xml(profile)
    elif "word/header1.xml" in names:
        replacements["word/header1.xml"] = _header_xml(profile)
    return replace_docx_entries(base_docx, replacements)
