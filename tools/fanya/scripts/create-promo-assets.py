from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "assets"
DEMO = ASSETS / "demo"
FONT_PATH = Path("C:/Windows/Fonts/simhei.ttf")

BG = (247, 249, 252)
INK = (31, 41, 55)
MUTED = (100, 116, 139)
BLUE = (37, 99, 235)
GREEN = (16, 185, 129)
ORANGE = (245, 158, 11)
RED = (239, 68, 68)
PURPLE = (124, 58, 237)
CARD = (255, 255, 255)
LINE = (226, 232, 240)


def font(size, bold=False):
    if FONT_PATH.exists():
        return ImageFont.truetype(str(FONT_PATH), size=size)
    return ImageFont.load_default()


F12 = font(12)
F14 = font(14)
F16 = font(16)
F17 = font(17)
F18 = font(18)
F20 = font(20)
F24 = font(24)
F28 = font(28)
F34 = font(34)
F36 = font(36)
F38 = font(38)
F42 = font(42)


def mkdirs():
    ASSETS.mkdir(exist_ok=True)
    DEMO.mkdir(exist_ok=True)


def canvas(w, h, color=BG):
    return Image.new("RGB", (w, h), color)


def draw_round(draw, xy, r=18, fill=CARD, outline=LINE, width=1):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def text(draw, xy, value, f=F16, fill=INK, anchor=None):
    draw.text(xy, value, font=f, fill=fill, anchor=anchor)


def wrap_text(draw, value, f, max_width):
    lines = []
    for raw in value.split("\n"):
        line = ""
        for ch in raw:
            trial = line + ch
            if draw.textbbox((0, 0), trial, font=f)[2] <= max_width:
                line = trial
            else:
                if line:
                    lines.append(line)
                line = ch
        if line:
            lines.append(line)
    return lines


def paragraph(draw, xy, value, f=F16, fill=MUTED, max_width=400, line_gap=8):
    x, y = xy
    for line in wrap_text(draw, value, f, max_width):
        text(draw, (x, y), line, f, fill)
        y += f.size + line_gap
    return y


def pill(draw, xy, label, color, f=F14):
    x, y = xy
    bbox = draw.textbbox((0, 0), label, font=f)
    w = bbox[2] - bbox[0] + 26
    h = bbox[3] - bbox[1] + 14
    draw.rounded_rectangle((x, y, x + w, y + h), radius=999, fill=color)
    text(draw, (x + 13, y + 6), label, f, (255, 255, 255))
    return x + w + 8


def file_tile(draw, x, y, w, h, label, ext, color):
    draw_round(draw, (x, y, x + w, y + h), 14, fill=(255, 255, 255), outline=LINE)
    draw.rounded_rectangle((x + 14, y + 14, x + 54, y + 54), radius=8, fill=color)
    text(draw, (x + 34, y + 35), ext, F12, (255, 255, 255), "mm")
    text(draw, (x + 66, y + 17), label, F16, INK)
    text(draw, (x + 66, y + 42), "学生提交附件", F12, MUTED)


def mini_chart(draw, x, y, scores):
    max_h = 90
    for i, s in enumerate(scores):
        h = int(max_h * s / 100)
        bx = x + i * 20
        draw.rounded_rectangle((bx, y + max_h - h, bx + 12, y + max_h), radius=4, fill=BLUE)
    text(draw, (x, y + max_h + 10), "分数分布检查", F12, MUTED)


def make_hero():
    img = canvas(1600, 900)
    d = ImageDraw.Draw(img)
    text(d, (80, 70), "泛雅 / 超星作业评阅助手", F42, INK)
    paragraph(d, (82, 128), "本地整理视觉类、视频类和混合作业\n辅助生成作品总览、建议分数、学生评语和 Excel，不会自动提交网页成绩。", F20, MUTED, 980, 10)
    x = 82
    for label, color in [("本地处理", GREEN), ("老师确认", BLUE), ("不提交成绩", RED), ("适合混合作业", PURPLE)]:
        x = pill(d, (x, 220), label, color, F16)

    draw_round(d, (80, 300, 480, 800), 24)
    text(d, (110, 330), "1  混合作业输入", F24, INK)
    file_tile(d, 110, 390, 320, 72, "final-video.mp4", "MP4", RED)
    file_tile(d, 110, 480, 320, 72, "layout-board.jpg", "JPG", GREEN)
    file_tile(d, 110, 570, 320, 72, "report.pdf", "PDF", ORANGE)
    file_tile(d, 110, 660, 320, 72, "process.pptx", "PPT", PURPLE)

    draw_round(d, (600, 300, 1000, 800), 24)
    text(d, (630, 330), "2  作品总览 / Evidence", F24, INK)
    colors = [(96, 165, 250), (52, 211, 153), (251, 191, 36), (167, 139, 250), (248, 113, 113), (45, 212, 191)]
    names = ["A", "B", "C", "D", "E", "F"]
    for i in range(6):
        cx = 635 + (i % 2) * 170
        cy = 390 + (i // 2) * 120
        d.rounded_rectangle((cx, cy, cx + 140, cy + 82), radius=14, fill=colors[i])
        d.line((cx + 10, cy + 60, cx + 50, cy + 35, cx + 90, cy + 50, cx + 130, cy + 20), fill=(255, 255, 255), width=4)
        text(d, (cx + 70, cy + 103), f"示例学生{names[i]}", F14, INK, "mm")
    text(d, (630, 745), "按评分标准优先展示关键材料", F14, MUTED)

    draw_round(d, (1120, 300, 1520, 800), 24)
    text(d, (1150, 330), "3  评阅记录 + Excel", F24, INK)
    rows = [("示例学生A", "88", "画面完成度较好，层次清晰。"), ("示例学生B", "84", "主题明确，细节可再加强。"), ("示例学生C", "91", "表现完整，风格统一。")]
    y = 395
    for name, score, comment in rows:
        draw_round(d, (1150, y, 1490, y + 82), 14, fill=(248, 250, 252), outline=LINE)
        text(d, (1170, y + 17), name, F16, INK)
        text(d, (1445, y + 17), score, F20, BLUE)
        text(d, (1170, y + 46), comment, F14, MUTED)
        y += 102
    mini_chart(d, 1160, 690, [74, 82, 84, 86, 88, 91, 85, 83, 87])
    img.save(ASSETS / "readme-hero.png", quality=95)
    img.save(DEMO / "readme-hero-promotional.png", quality=95)


def make_workflow():
    img = canvas(1600, 680)
    d = ImageDraw.Draw(img)
    text(d, (80, 60), "从作业压缩包到 Excel 的本地评阅流程", F34, INK)
    steps = [
        ("作业压缩包", "放入 tmp/bundle"),
        ("确认评分标准", "rubric 先给用户确认"),
        ("真实学生名单", "来自压缩包或网页"),
        ("准备材料", "抽帧 / PDF / 文档文本"),
        ("草稿评阅", "draftReviews 先检查"),
        ("用户确认", "dry-run 后转正式"),
        ("导出 Excel", "保存在 outputs"),
    ]
    x, y = 80, 190
    for i, (title, sub) in enumerate(steps):
        draw_round(d, (x, y, x + 190, y + 160), 20)
        d.ellipse((x + 20, y + 20, x + 62, y + 62), fill=BLUE)
        text(d, (x + 41, y + 41), str(i + 1), F20, (255, 255, 255), "mm")
        text(d, (x + 20, y + 82), title, F20, INK)
        paragraph(d, (x + 20, y + 114), sub, F14, MUTED, 150, 4)
        if i < len(steps) - 1:
            d.line((x + 200, y + 80, x + 240, y + 80), fill=LINE, width=4)
            d.polygon([(x + 240, y + 80), (x + 228, y + 72), (x + 228, y + 88)], fill=LINE)
        x += 220
    draw_round(d, (290, 460, 1310, 590), 22, fill=(239, 246, 255), outline=(191, 219, 254))
    text(d, (330, 495), "核心边界", F24, BLUE)
    paragraph(d, (470, 490), "不在网页提交成绩；不跳过评分标准确认；不使用 sample 学生名单；快速批阅先写草稿，用户确认后才转为正式记录。", F18, INK, 760, 8)
    img.save(DEMO / "workflow-overview.png", quality=95)


def make_before_after():
    img = canvas(1600, 900)
    d = ImageDraw.Draw(img)
    text(d, (80, 70), "Before / After：少开文件，多看整体", F38, INK)
    draw_round(d, (80, 160, 760, 790), 26)
    draw_round(d, (840, 160, 1520, 790), 26)
    text(d, (120, 205), "Before：手动逐个打开", F28, RED)
    text(d, (880, 205), "After：本地整理后评阅", F28, GREEN)
    for i in range(8):
        x = 125 + (i % 2) * 295
        y = 275 + (i // 2) * 105
        file_tile(d, x, y, 245, 74, f"学生{i+1}附件包", ["ZIP", "PDF", "MP4", "PPT"][i % 4], [ORANGE, BLUE, RED, PURPLE][i % 4])
    paragraph(d, (125, 705), "文件类型混杂、反复解压、逐个打开、再手动整理表格。", F18, MUTED, 560, 8)
    for i in range(6):
        x = 890 + (i % 3) * 180
        y = 285 + (i // 3) * 150
        d.rounded_rectangle((x, y, x + 135, y + 90), radius=14, fill=[BLUE, GREEN, ORANGE, PURPLE, RED, (20, 184, 166)][i])
        d.arc((x + 20, y + 15, x + 115, y + 105), 190, 350, fill=(255, 255, 255), width=5)
        text(d, (x + 68, y + 114), f"示例{i+1}", F14, INK, "mm")
    draw_round(d, (890, 575, 1465, 700), 18, fill=(248, 250, 252))
    text(d, (920, 605), "Excel 输出", F20, INK)
    for j, col in enumerate(["学生", "分数", "评语"]):
        text(d, (920 + j * 155, 640), col, F16, BLUE)
    paragraph(d, (890, 720), "先总览，再补看异常和边界样本，最终导出本地 Excel。", F18, MUTED, 540, 8)
    img.save(DEMO / "before-after.png", quality=95)


def make_contact_sheet():
    img = canvas(1600, 1080)
    d = ImageDraw.Draw(img)
    text(d, (70, 50), "虚构作品总览图示例", F36, INK)
    paragraph(d, (72, 100), "每个格子代表一个学生的关键图片、视频帧或 PDF 页面。实际选择会根据评分标准和作业类型决定。", F18, MUTED, 900, 8)
    colors = [(59, 130, 246), (16, 185, 129), (245, 158, 11), (124, 58, 237), (239, 68, 68), (20, 184, 166), (99, 102, 241), (14, 165, 233), (234, 88, 12), (132, 204, 22), (236, 72, 153), (100, 116, 139)]
    for i in range(12):
        x = 70 + (i % 4) * 380
        y = 180 + (i // 4) * 275
        draw_round(d, (x, y, x + 330, y + 230), 18)
        for s in range(2):
            sx = x + 24 + s * 142
            sy = y + 26
            d.rounded_rectangle((sx, sy, sx + 120, sy + 86), radius=12, fill=colors[(i + s) % len(colors)])
            d.line((sx + 12, sy + 66, sx + 42, sy + 38, sx + 75, sy + 56, sx + 110, sy + 22), fill=(255, 255, 255), width=4)
            text(d, (sx + 60, sy + 104), ["最终帧", "补充图"][s], F12, MUTED, "mm")
        text(d, (x + 24, y + 162), f"202400{str(i+1).zfill(2)}  示例学生{chr(65+i)}", F16, INK)
        text(d, (x + 24, y + 190), ["完成度较高", "材料完整", "需补看报告", "边界样本"][i % 4], F14, [GREEN, BLUE, ORANGE, RED][i % 4])
    img.save(DEMO / "fake-contact-sheet.png", quality=95)


def make_excel_preview():
    img = canvas(1500, 900)
    d = ImageDraw.Draw(img)
    text(d, (80, 65), "最终 Excel 输出预览", F38, INK)
    paragraph(d, (82, 120), "评阅记录可以导出为 Excel。一个 result 文件里有多个作业时，每个作业会成为不同工作表。", F18, MUTED, 900, 8)
    x0, y0 = 110, 220
    widths = [240, 130, 880]
    headers = ["学生", "分数", "评语"]
    draw_round(d, (x0, y0, x0 + sum(widths), y0 + 520), 22)
    y = y0 + 30
    x = x0 + 30
    for j, h in enumerate(headers):
        d.rectangle((x, y, x + widths[j], y + 48), fill=(239, 246, 255))
        text(d, (x + 16, y + 13), h, F18, BLUE)
        x += widths[j]
    rows = [
        ("示例学生A", "88", "作品主题明确，视觉层次较完整，最终呈现有较好的完成度。后续可继续加强细节统一性。"),
        ("示例学生B", "84", "材料提交完整，画面表达清楚，但部分过程说明还可以更具体。建议补充关键制作步骤。"),
        ("示例学生C", "91", "整体风格统一，核心画面表现突出，技术完成度较高。可进一步优化展示节奏。"),
        ("示例学生D", "78", "已完成主要提交内容，但作品完整度和细节表现仍偏弱。建议优先补强最终呈现质量。"),
    ]
    y += 48
    for row in rows:
        x = x0 + 30
        for j, val in enumerate(row):
            fill = (255, 255, 255) if len(rows) % 2 else (248, 250, 252)
            d.rectangle((x, y, x + widths[j], y + 78), fill=fill, outline=LINE)
            paragraph(d, (x + 16, y + 14), val, F16, INK if j < 2 else MUTED, widths[j] - 28, 4)
            x += widths[j]
        y += 78
    draw_round(d, (110, 790, 1390, 845), 18, fill=(240, 253, 244), outline=(187, 247, 208))
    text(d, (140, 807), "默认本地导出；用户可在提交或归档前继续检查、修改和筛选。", F20, (22, 101, 52))
    img.save(DEMO / "excel-output-preview.png", quality=95)


def make_safety():
    img = canvas(1400, 760)
    d = ImageDraw.Draw(img)
    text(d, (80, 60), "安全边界：辅助评阅，不替代老师", F38, INK)
    items = [
        ("不会提交网页成绩", "只在本地生成评阅记录和 Excel", RED),
        ("评分标准先确认", "rubric 确认后才开始看学生作业", BLUE),
        ("草稿先检查", "draftReviews 通过 dry-run 后再转正式", ORANGE),
        ("数据本地保存", "公开 demo 必须使用虚构数据", GREEN),
    ]
    for i, (title, sub, color) in enumerate(items):
        x = 100 + (i % 2) * 620
        y = 180 + (i // 2) * 220
        draw_round(d, (x, y, x + 540, y + 160), 24)
        d.ellipse((x + 32, y + 38, x + 96, y + 102), fill=color)
        text(d, (x + 64, y + 70), "✓" if color != RED else "!", F28, (255, 255, 255), "mm")
        text(d, (x + 125, y + 42), title, F24, INK)
        paragraph(d, (x + 126, y + 82), sub, F17, MUTED, 360, 6)
    img.save(DEMO / "safety-boundaries.png", quality=95)


def make_gif():
    frames = []
    labels = [
        ("放入作业压缩包", "zip / PDF / 视频 / 图片 / PPT"),
        ("生成作品总览", "按评分标准优先查看关键材料"),
        ("写入评阅记录", "建议分数 + 学生可读评语"),
        ("导出 Excel", "本地检查、修改和归档"),
    ]
    for idx, (title, sub) in enumerate(labels):
        img = canvas(960, 540)
        d = ImageDraw.Draw(img)
        text(d, (60, 55), "泛雅 / 超星本地评阅流程", F28, INK)
        for i, (t, _) in enumerate(labels):
            x = 70 + i * 215
            color = BLUE if i <= idx else (203, 213, 225)
            d.ellipse((x, 165, x + 70, 235), fill=color)
            text(d, (x + 35, 200), str(i + 1), F24, (255, 255, 255), "mm")
            text(d, (x - 20, 255), t, F16, INK if i <= idx else MUTED)
            if i < 3:
                d.line((x + 80, 200, x + 190, 200), fill=color, width=5)
        draw_round(d, (190, 350, 770, 455), 22, fill=(255, 255, 255), outline=LINE)
        text(d, (230, 378), title, F28, BLUE)
        text(d, (230, 418), sub, F18, MUTED)
        frames.append(img)
    frames[0].save(DEMO / "quick-demo.gif", save_all=True, append_images=frames[1:], duration=950, loop=0)


def main():
    mkdirs()
    make_hero()
    make_workflow()
    make_before_after()
    make_contact_sheet()
    make_excel_preview()
    make_safety()
    make_gif()
    print("Generated promotional assets in assets/ and assets/demo/")


if __name__ == "__main__":
    main()
