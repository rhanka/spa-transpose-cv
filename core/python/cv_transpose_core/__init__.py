from .types import InputFile, TemplateAssets, TransposeInput


async def transpose(input_: TransposeInput):
    raise NotImplementedError("transpose() is implemented in Task 8")


__all__ = [
    "InputFile",
    "TemplateAssets",
    "TransposeInput",
    "transpose",
]
