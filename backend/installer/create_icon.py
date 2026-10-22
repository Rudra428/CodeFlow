from pathlib import Path

from PIL import Image, ImageDraw


def create_icon():
    image = Image.new("RGBA", (256, 256), (11, 18, 32, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((8, 8, 248, 248), radius=68, fill=(16, 29, 48, 255))
    draw.line(((88, 80), (48, 128), (88, 176)), fill=(94, 234, 212, 255), width=17, joint="curve")
    draw.line(((168, 80), (208, 128), (168, 176)), fill=(96, 165, 250, 255), width=17, joint="curve")
    draw.line(((108, 158), (148, 98)), fill=(88, 196, 225, 255), width=14)
    draw.ellipse((116, 116, 140, 140), fill=(252, 211, 77, 255))
    return image


if __name__ == "__main__":
    output = Path(__file__).resolve().parent / "codeflow.ico"
    create_icon().save(output, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Created {output}")
