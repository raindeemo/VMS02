from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


SOURCE = Path("Specification/VMS_Production_Specification_Codex.docx")
OUTPUT = Path("tmp/specification-extracted.txt")


def clean(value):
    return " ".join(value.replace("\xa0", " ").split())


def main():
    document = Document(str(SOURCE))
    lines = []
    paragraph_index = 0
    table_index = 0

    for item in document.iter_inner_content():
        if isinstance(item, Paragraph):
            text = clean(item.text)
            if text:
                lines.append(
                    "P{0:04d} [{1}] {2}".format(
                        paragraph_index, item.style.name, text
                    )
                )
            paragraph_index += 1
        elif isinstance(item, Table):
            lines.append("TABLE {0:02d} START".format(table_index))
            for row_index, row in enumerate(item.rows):
                cells = [clean(cell.text) for cell in row.cells]
                lines.append(
                    "T{0:02d}R{1:03d} | {2}".format(
                        table_index, row_index, " | ".join(cells)
                    )
                )
            lines.append("TABLE {0:02d} END".format(table_index))
            table_index += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(
        "Wrote {0} lines from {1} paragraphs and {2} tables to {3}".format(
            len(lines), paragraph_index, table_index, OUTPUT
        )
    )


if __name__ == "__main__":
    main()
