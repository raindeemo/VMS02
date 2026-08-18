from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


def build(source, output, columns, rows, thumb_width):
    paths = sorted(source.glob("*.png"))
    font = ImageFont.load_default()
    batch_size = columns * rows

    for batch_index in range(0, len(paths), batch_size):
        batch = paths[batch_index : batch_index + batch_size]
        samples = []
        for path in batch:
            image = Image.open(path).convert("RGB")
            height = int(image.height * thumb_width / image.width)
            samples.append((path, image.resize((thumb_width, height))))

        label_height = 24
        cell_height = max(image.height for _, image in samples) + label_height
        sheet = Image.new(
            "RGB", (columns * thumb_width, rows * cell_height), "white"
        )
        draw = ImageDraw.Draw(sheet)

        for index, (path, image) in enumerate(samples):
            x = (index % columns) * thumb_width
            y = (index // columns) * cell_height
            sheet.paste(image, (x, y + label_height))
            draw.text((x + 6, y + 6), path.stem, fill="black", font=font)

        suffix = batch_index // batch_size + 1
        sheet.save(output.with_name(output.stem + "-{0}.png".format(suffix)))


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
