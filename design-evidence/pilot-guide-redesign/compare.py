from pathlib import Path
from PIL import Image, ImageDraw

evidence = Path(__file__).parent
pairs = [
    ("selected-desktop.png", "desktop-first.jpg", "comparison-desktop-first.jpg", (1440, 1024)),
    ("selected-phone.png", "phone-first.jpg", "comparison-phone-first.jpg", (390, 844)),
    ("selected-desktop.png", "desktop-final.jpg", "comparison-desktop-final.jpg", (1440, 1024)),
    ("selected-phone.png", "phone-final.jpg", "comparison-phone-final.jpg", (390, 844)),
]
for source, capture, output, size in pairs:
    print(source, Image.open(evidence / source).size, capture, Image.open(evidence / capture).size)
    comparison = Image.new("RGB", (size[0] * 2, size[1] + 30), "#e5e7eb")
    labels = ImageDraw.Draw(comparison)
    labels.text((12, 8), "Selected design", fill="black")
    labels.text((size[0] + 12, 8), "Implementation", fill="black")
    comparison.paste(Image.open(evidence / source).convert("RGB").resize(size), (0, 30))
    comparison.paste(Image.open(evidence / capture).convert("RGB").resize(size), (size[0], 30))
    comparison.save(evidence / output)

preview = Image.new("RGB", (1830, 1024), "#f6f3ee")
preview.paste(Image.open(evidence / "desktop-final.jpg").resize((1440, 1024)), (0, 0))
preview.paste(Image.open(evidence / "phone-final.jpg").resize((390, 844)), (1440, 0))
preview.save(evidence / "desktop-and-phone.jpg")
