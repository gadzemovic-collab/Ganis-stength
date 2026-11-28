"""Render Rep Harbor's original exercise diagrams. Requires Pillow and DejaVu Sans."""

import json
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "exercise-images"
# Each view lists shoulder, hip, elbow, hand, knee and ankle.
# An optional extra leg lists knee and ankle for unilateral movements.
# Coordinates are in a 320 × 264 panel. The equipment is drawn independently.
DEMOS = [
    ("Leg Press", "press", "Set both feet flat on the plate.", "Press without snapping your knees straight.", "116,119 151,176 130,150 149,170 194,124 227,102", "116,119 151,176 130,150 149,170 202,141 249,106"),
    ("Leg Extension", "extension", "Line up your knees with the pivot.", "Straighten your knees and keep your hips seated.", "123,94 130,151 140,130 152,151 191,153 183,211", "123,94 130,151 140,130 152,151 191,153 248,155"),
    ("Squat", "backbar", "Set the bar on your upper back.", "Bend at the hips and knees; keep feet planted.", "158,83 152,151 140,111 153,81 154,197 155,239", "153,108 123,165 137,138 146,105 174,170 155,239"),
    ("Goblet Squat", "goblet", "Hold the weight in front of your chest.", "Sit down between your hips with heels planted.", "146,85 145,151 170,124 175,100 147,197 146,239", "148,117 122,169 173,150 181,129 173,177 146,239"),
    ("Hack Squat", "hack", "Set your shoulders under the pads.", "Lower on the rails, keeping feet on the platform.", "132,87 153,147 161,109 152,83 174,188 195,232", "156,120 179,180 182,148 175,119 207,176 195,232"),
    ("Bulgarian Split Squat", "splitbench", "Rest your rear foot on the bench.", "Lower your back knee while the front foot stays flat.", "157,85 153,150 154,121 157,151 188,190 199,239 113,183 91,189", "169,118 156,174 169,152 171,182 204,184 199,239 121,225 91,189"),
    ("Walking Lunge", "none", "Take a step forward and plant the whole foot.", "Lower into the lunge, then step through.", "155,83 154,149 160,118 160,151 188,181 211,239 128,193 116,239", "170,114 163,171 173,147 174,181 207,183 211,239 130,224 116,239"),
    ("Seated Leg Curl", "seatcurl", "Start with legs extended under the pads.", "Curl your heels down and back; keep thighs seated.", "122,94 127,151 142,130 161,145 191,152 248,154", "122,94 127,151 142,130 161,145 191,152 160,211"),
    ("Deadlift", "bar", "Start over the bar with it close to your shins.", "Stand tall with the bar close to your legs.", "174,139 116,168 175,174 174,207 158,190 153,239", "151,87 151,153 165,121 169,158 153,196 153,239"),
    ("Standing Leg Curl", "standcurl", "Brace on the machine with one leg supporting you.", "Bend the working knee to bring your heel back.", "150,86 144,149 174,109 191,101 147,194 142,236 153,195 157,239", "150,86 144,149 174,109 191,101 146,194 98,158 153,195 157,239"),
    ("Romanian Deadlift", "bar", "Start standing with the bar against your thighs.", "Hinge at the hips; keep a soft bend in your knees.", "148,86 147,151 164,122 169,157 150,198 149,239", "182,126 112,151 183,162 183,198 138,194 149,239"),
    ("Lying Leg Curl", "lyingcurl", "Lie face down with the roller above your heels.", "Curl your heels toward your hips.", "99,148 167,151 88,170 107,176 211,153 257,154", "99,148 167,151 88,170 107,176 211,153 219,99"),
    ("Hip Thrust", "hipbench", "Support your upper back and plant your feet.", "Lift your hips until your torso is level.", "97,152 153,207 127,174 154,195 206,194 223,239", "97,152 159,158 124,166 162,148 216,183 223,239"),
    ("Glute Bridge", "mat", "Lie back with knees bent and feet flat.", "Lift your hips while your shoulders stay down.", "104,222 168,225 130,230 155,230 203,181 226,239", "104,222 167,185 131,230 151,230 207,175 226,239"),
    ("Cable Kickback", "lowcable", "Attach the low cable to your working ankle.", "Move that leg back while keeping your hips square.", "182,92 159,151 204,117 224,109 148,194 144,235 166,196 171,239", "182,92 159,151 204,117 224,109 120,178 89,204 166,196 171,239"),
    ("Step-Up", "step", "Place your whole lead foot on the box.", "Drive through that foot to stand on the box.", "145,91 139,152 157,120 163,153 171,155 202,192 127,193 117,239", "201,43 201,105 217,76 216,108 197,150 202,192 178,150 173,192"),
    ("DB Bench Press", "benchdb", "Lower the dumbbells beside your chest.", "Press above the chest with wrists over elbows.", "112,156 178,158 146,182 146,146 220,193 228,239", "112,156 178,158 133,121 142,83 220,193 228,239"),
    ("Incline Chest Press", "inclinemachine", "Set the handles near your upper chest.", "Press up and forward along the machine's path.", "123,103 160,168 144,141 164,107 202,190 214,239", "123,103 160,168 163,100 203,90 202,190 214,239"),
    ("Pec Deck", "pec", "Open your arms with a slight elbow bend.", "Bring the handles together without shrugging.", "160,92 160,158 218,105 247,95 185,186 188,234", "160,92 160,158 190,109 165,118 185,186 188,234"),
    ("Barbell Bench Press", "benchbar", "Lower the bar toward your mid-to-lower chest.", "Press upward until your arms are extended.", "111,156 177,158 145,184 144,144 220,194 229,239", "111,156 177,158 128,119 138,81 220,194 229,239"),
    ("Incline DB Bench Press", "inclinedb", "Lower the dumbbells beside your upper chest.", "Press up while keeping your back on the bench.", "120,108 158,174 147,137 153,103 202,193 209,239", "120,108 158,174 141,78 155,44 202,193 209,239"),
    ("Push-Up", "mat", "Start with a straight line from shoulders to heels.", "Lower your chest while maintaining that line.", "108,145 177,174 112,193 113,239 218,196 266,231", "112,194 180,208 148,215 113,239 221,219 266,231"),
    ("Cable Fly", "fly", "Start with arms open and elbows slightly bent.", "Sweep the handles together in front of your chest.", "160,93 160,156 221,109 254,96 188,197 193,239", "160,93 160,156 195,114 164,128 188,197 193,239"),
    ("Lat Pulldown", "pulldown", "Reach for the bar with a wide grip.", "Pull toward your upper chest, elbows down.", "160,110 160,169 201,73 221,42 190,201 193,239", "160,110 160,169 213,143 213,102 190,201 193,239"),
    ("Chest-Supported Row", "chestbench", "Support your chest and let the weights hang.", "Pull your elbows back and keep your chest on the pad.", "191,101 153,165 200,139 204,177 121,199 117,239", "191,101 153,165 155,108 173,137 121,199 117,239"),
    ("Machine High Row", "highrow", "Start with your arms reaching up and forward.", "Drive your elbows down and back toward your ribs.", "147,104 143,167 176,85 211,67 180,190 185,239", "147,104 143,167 128,141 164,120 180,190 185,239"),
    ("Seated Cable Row", "rowcable", "Reach forward without rounding your back.", "Pull toward your lower ribs without rocking.", "126,119 119,181 162,139 198,149 184,165 239,189", "118,117 119,181 105,151 141,154 184,165 239,189"),
    ("Pull-Up", "pullup", "Hang with your arms extended.", "Pull until your chin clears the bar.", "160,115 160,174 200,80 213,41 177,211 181,245", "160,50 160,115 209,82 213,41 178,157 182,192"),
    ("One-Arm DB Row", "onebench", "Brace on the bench and let the dumbbell hang.", "Pull the dumbbell toward your hip, torso steady.", "177,129 112,144 170,165 167,202 121,192 122,239", "177,129 112,144 138,122 142,159 121,192 122,239"),
    ("Lateral Raise", "frontdb", "Start with dumbbells at your sides.", "Raise out to the sides to about shoulder height.", "160,87 160,151 190,119 196,153 176,197 183,239", "160,87 160,151 215,94 253,92 176,197 183,239"),
    ("DB Shoulder Press", "frontdb", "Start with dumbbells at shoulder height.", "Press up without leaning back.", "160,99 160,156 211,119 211,84 176,197 183,239", "160,99 160,156 189,65 187,29 176,197 183,239"),
    ("Machine Shoulder Press", "frontmachine", "Set the handles slightly above shoulder level.", "Press overhead while staying against the pad.", "160,101 160,167 208,123 208,89 185,199 190,239", "160,101 160,167 194,65 194,32 185,199 190,239"),
    ("Barbell Overhead Press", "bar", "Start with the bar at the front of your shoulders.", "Press overhead and finish over your midfoot.", "150,94 150,156 177,126 169,94 152,200 151,239", "150,94 150,156 152,65 151,30 152,200 151,239"),
    ("Front Raise", "db", "Start with the weight in front of your thighs.", "Raise it in front of you to shoulder height.", "143,87 143,151 156,121 162,155 146,197 146,239", "143,87 143,151 184,93 224,89 146,197 146,239"),
    ("Reverse Pec Deck", "reversepec", "Face the pad and start with handles in front.", "Move your arms outward while keeping your chest supported.", "160,92 160,158 185,109 164,118 185,186 188,234", "160,92 160,158 216,105 245,94 185,186 188,234"),
    ("Face Pull", "facecable", "Reach toward the rope at face height.", "Pull toward your face, hands beside your head.", "143,89 141,152 185,89 222,88 147,197 152,239", "143,89 141,152 163,110 155,78 147,197 152,239"),
    ("Bent-Over Rear Delt Fly", "frontdb", "Hinge forward and let the weights hang.", "Raise both arms out, keeping your torso steady.", "160,110 160,150 184,145 192,181 176,196 184,239", "160,110 160,150 217,118 251,114 176,196 184,239"),
    ("DB Curl", "db", "Let the dumbbell hang with palm facing forward.", "Curl by bending the elbow; keep your upper arm still.", "145,88 144,152 153,124 156,157 145,196 147,239", "145,88 144,152 153,124 169,98 145,196 147,239"),
    ("Hammer Curl", "hammer", "Hold the dumbbell with your thumb pointing forward.", "Curl with the thumb up and keep the elbow still.", "145,88 144,152 153,124 156,157 145,196 147,239", "145,88 144,152 153,124 174,101 145,196 147,239"),
    ("Preacher Curl", "preacher", "Rest your upper arm on the angled pad.", "Curl while maintaining contact with the pad.", "126,91 118,158 161,127 189,159 153,185 162,239", "126,91 118,158 161,127 155,93 153,185 162,239"),
    ("EZ-Bar Curl", "ez", "Stand tall with the EZ bar in front of your thighs.", "Curl the bar without swinging your shoulders.", "145,88 144,152 153,124 156,157 145,196 147,239", "145,88 144,152 153,124 169,98 145,196 147,239"),
    ("Cable Curl", "handlow", "Face the low pulley with elbows by your sides.", "Curl the handle while keeping your elbows steady.", "145,88 144,152 153,124 163,158 145,196 147,239", "145,88 144,152 153,124 170,98 145,196 147,239"),
    ("Incline DB Curl", "inclinedb", "Sit against the incline bench and let your arms hang.", "Curl without bringing your upper arm forward.", "120,108 158,174 126,145 128,181 202,193 209,239", "120,108 158,174 126,145 151,119 202,193 209,239"),
    ("Triceps Pushdown", "handhigh", "Keep your elbows by your sides and grip the handle.", "Straighten your elbows toward the floor.", "137,89 131,151 146,125 181,123 134,193 137,239", "137,89 131,151 146,125 153,163 134,193 137,239"),
    ("Triceps Dip Machine", "dip", "Sit tall with the handles near your hips.", "Press the handles down while keeping your shoulders steady.", "138,96 138,163 123,132 147,149 188,187 199,239", "138,96 138,163 136,132 146,168 188,187 199,239"),
    ("Overhead Cable Extension", "behindcable", "Face away from the pulley with hands behind your head.", "Straighten your elbows overhead without flaring them.", "161,99 144,158 177,69 151,83 172,197 188,239 125,198 113,239", "161,99 144,158 177,69 196,41 172,197 188,239 125,198 113,239"),
    ("Skull Crusher", "skull", "Hold the EZ bar above your shoulders while lying down.", "Bend at the elbows to lower the bar behind your forehead.", "113,155 178,157 113,118 113,82 219,192 230,239", "113,155 178,157 113,118 81,139 219,192 230,239"),
    ("Close-Grip Bench Press", "benchclose", "Lower with hands roughly shoulder-width apart.", "Press upward with elbows closer to your sides.", "111,156 177,158 143,176 148,144 219,193 230,239", "111,156 177,158 128,119 139,81 219,193 230,239"),
    ("Calf Raise", "calf", "Stand on the edge with heels lowered under control.", "Rise onto the balls of both feet.", "149,92 148,157 169,123 190,116 149,197 147,236", "148,77 148,142 169,111 190,116 149,182 149,219"),
    ("Seated Calf Raise", "seatedcalf", "Set the pad above the knees with heels lowered.", "Raise your heels while your thighs stay under the pad.", "126,104 130,166 151,134 176,152 189,169 183,232", "126,104 130,166 151,134 176,152 190,155 184,215"),
    ("Standing Calf Raise", "calfmachine", "Place your shoulders under the machine pads.", "Lift your heels while keeping knees nearly straight.", "149,88 149,153 164,121 171,92 150,195 149,236", "149,74 149,140 164,107 171,78 150,181 150,219"),
    ("Single-Leg Calf Raise", "calf", "Balance on one foot with your free foot lifted.", "Raise the working heel without rolling the ankle.", "149,92 148,157 169,123 190,116 149,197 147,236 123,193 110,173", "148,77 148,142 169,111 190,116 149,182 149,219 123,175 109,155"),
    ("Cable Crunch", "handhigh", "Kneel with the rope close to your head.", "Curl your ribs toward your hips, keeping the rope in place.", "147,118 140,176 172,138 155,112 170,231 119,238", "179,170 140,176 198,188 185,153 170,231 119,238"),
    ("Hanging Knee Raise", "pullupside", "Hang from the bar with legs down.", "Curl upward and bring bent knees toward your chest.", "145,112 145,174 146,75 146,40 145,211 147,245", "145,112 151,170 146,75 146,40 199,145 192,193"),
    ("Reverse Crunch", "mat", "Lie down with hips and knees bent.", "Curl your pelvis up and bring knees toward your chest.", "99,223 166,225 125,230 154,231 170,165 219,168", "99,223 164,197 125,230 154,231 142,157 190,153"),
    ("Ab Wheel Rollout", "wheel", "Kneel with the wheel below your shoulders.", "Roll forward as far as you can keep your trunk braced.", "166,145 122,170 176,183 187,225 137,232 96,239", "196,176 145,195 224,197 257,225 137,232 96,239"),
]

NAVY = "#163c55"
TEAL = "#007f78"
MUTED = "#657d8c"
STEEL = "#809aab"
AMBER = "#9a4919"
PANEL = "#f1f7fa"
WHITE = "#ffffff"
SCALE = 2
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def points(encoded):
    return [tuple(map(int, item.split(","))) for item in encoded.split()]


class Panel:
    def __init__(self, image, offset):
        self.draw = ImageDraw.Draw(image)
        self.offset = offset

    def xy(self, point):
        return ((point[0] + self.offset) * SCALE, point[1] * SCALE)

    def line(self, *path, fill=STEEL, width=5):
        self.draw.line([self.xy(point) for point in path], fill, width * SCALE, joint="curve")

    def dot(self, point, radius, fill, outline=None):
        x, y = self.xy(point)
        r = radius * SCALE
        self.draw.ellipse((x-r, y-r, x+r, y+r), fill, outline, 2 * SCALE if outline else 1)

    def text(self, point, message, size, fill=NAVY):
        self.draw.text(self.xy(point), message, fill, font=ImageFont.truetype(FONT, size * SCALE))

    def bench(self, left, right, base_y=240):
        self.line(left, right, fill=MUTED, width=9)
        for x, y in (left, right):
            if y < base_y:
                self.line((x, y), (x, base_y), width=3)


def equipment(p, kind, joints):
    shoulder, hip, elbow, hand, knee, ankle, *_ = joints
    if kind in ("benchdb", "benchbar", "benchclose", "skull", "lyingcurl"):
        p.bench((76, 168), (219 if kind == "lyingcurl" else 189, 168))
    if kind in ("inclinemachine", "inclinedb"):
        p.bench((96, 90), (151, 180))
        p.bench((151, 180), (189, 180))
    if kind in ("pec", "reversepec", "extension", "seatcurl", "seatedcalf", "dip", "frontmachine", "highrow", "pulldown"):
        p.bench((108, 173), (180, 173))
    if kind == "press":
        p.bench((99, 98), (146, 181), 217)
        p.bench((146, 181), (176, 181), 217)
        p.line((177, 206), (269, 126), width=3)
        p.line((ankle[0]-9, ankle[1]-23), (ankle[0]+19, ankle[1]+24), fill=MUTED, width=8)
    if kind == "hack":
        p.line((107, 59), (183, 205), width=4)
        p.line((128, 61), (211, 210), width=3)
        p.line((shoulder[0]-18, shoulder[1]-5), (shoulder[0]+12, shoulder[1]-14), fill=MUTED, width=7)
        p.line((173, 243), (225, 243), width=8)
    if kind == "splitbench":
        p.bench((52, 198), (102, 198))
    if kind == "hipbench":
        p.bench((60, 162), (112, 162))
    if kind == "chestbench":
        p.bench((147, 157), (192, 112))
    if kind == "onebench":
        p.bench((180, 181), (248, 181))
        p.line((shoulder[0]+9, shoulder[1]+4), (221, 176), fill=MUTED, width=6)
    if kind == "step":
        p.line((178, 199), (247, 199), (247, 240), width=7)
        p.line((178, 199), (178, 240), width=6)
    if kind == "rowcable":
        p.bench((94, 191), (152, 191))
        p.line((149, 212), (259, 212), width=4)
        p.line((232, 167), (250, 202), fill=MUTED, width=7)
    if kind in ("frontmachine", "dip"):
        p.line((109, 72), (109, 237), width=4)
        p.line((123, 105), (123, 167), fill=MUTED, width=8)
        for x in ({hand[0], 320-hand[0]} if kind == "frontmachine" else {hand[0]}):
            p.line((x-10, hand[1]), (x+10, hand[1]), fill=AMBER, width=5)
    if kind == "mat":
        p.line((65, 244), (279, 244), width=4)
    if kind == "preacher":
        p.bench((96, 167), (139, 167))
        p.line((137, 114), (184, 152), fill=MUTED, width=8)
        p.line((171, 143), (171, 238), width=4)
    if kind in ("extension", "seatcurl", "lyingcurl", "standcurl"):
        p.line(knee, ankle, fill=STEEL, width=3)
        p.dot(ankle, 12, PANEL, STEEL)
    if kind in ("calf", "seatedcalf", "calfmachine"):
        p.line((154, 237), (204, 237), (204, 244), width=7)
    if kind == "seatedcalf":
        p.line((170, knee[1]-11), (208, knee[1]-11), fill=MUTED, width=8)
    if kind == "calfmachine":
        p.line((218, 57), (218, 241), width=5)
        p.line((130, shoulder[1]-11), (181, shoulder[1]-11), fill=MUTED, width=7)
    if kind in ("calf", "standcurl"):
        p.line((192, 104), (192, 240), width=4)
    if kind in ("lowcable", "handlow", "rowcable", "handhigh", "facecable", "behindcable", "inclinemachine", "highrow"):
        anchor_x = 92 if kind == "behindcable" else 260
        anchor_y = {"lowcable": 226, "handlow": 224, "rowcable": 144, "facecable": 81, "inclinemachine": 64, "highrow": 63}.get(kind, 42)
        p.line((anchor_x, 37), (anchor_x, 242), width=3)
        p.dot((anchor_x, anchor_y), 6, PANEL, STEEL)
        p.line((anchor_x, anchor_y), ankle if kind == "lowcable" else hand, fill=AMBER, width=3)
    if kind in ("pec", "reversepec", "fly"):
        p.line((46, 71), (46, 242), width=4)
        p.line((274, 71), (274, 242), width=4)
        p.line((274, 86), hand, fill=STEEL, width=3)
        p.line((46, 86), (320-hand[0], hand[1]), fill=STEEL, width=3)
    if kind in ("pullup", "pullupside"):
        p.line((72, 41), (248, 41), fill=MUTED, width=7)
        p.line((73, 41), (73, 242), width=4)
    if kind == "pulldown":
        p.line((88, 36), (88, 242), width=4)
        p.line((88, 36), (160, 36), width=4)
        p.line((160, 36), (160, hand[1]), fill=AMBER, width=3)
        p.line((320-hand[0]-8, hand[1]), (hand[0]+8, hand[1]), fill=MUTED, width=6)
    if kind == "wheel":
        p.dot((hand[0], 235), 10, PANEL, AMBER)
        p.dot((hand[0], 235), 3, AMBER)


FRONT = {"pec", "reversepec", "fly", "pulldown", "pullup", "frontdb", "frontmachine"}
BAR = {"bar", "ez", "benchbar", "benchclose", "skull", "backbar", "hipbench"}
DUMBBELL = {"db", "hammer", "benchdb", "inclinedb", "frontdb", "chestbench", "onebench", "goblet", "preacher"}


def figure(p, kind, joints):
    shoulder, hip, elbow, hand, knee, ankle, *extra = joints
    frontal = kind in FRONT
    if frontal:
        for a, b, c in (
            ((136, shoulder[1]), (320-elbow[0], elbow[1]), (320-hand[0], hand[1])),
            ((148, hip[1]), (320-knee[0], knee[1]), (320-ankle[0], ankle[1])),
        ):
            p.line(a, b, c, fill=MUTED, width=8)
        near_shoulder = (184, shoulder[1])
        near_hip = (172, hip[1])
        p.line((136, shoulder[1]), near_shoulder, fill=NAVY, width=13)
        p.line((148, hip[1]), near_hip, fill=NAVY, width=12)
        p.line(ankle, (ankle[0]+13, ankle[1]+4), fill=TEAL, width=7)
        p.line((320-ankle[0], ankle[1]), (307-ankle[0], ankle[1]+4), fill=MUTED, width=7)
    else:
        near_shoulder, near_hip = shoulder, hip
        if extra:
            rear_knee, rear_ankle = extra
            p.line(hip, rear_knee, rear_ankle, fill=MUTED, width=8)
            p.line(rear_ankle, (rear_ankle[0]+11, rear_ankle[1]+5), fill=MUTED, width=6)
        dx, dy = (12, 12) if kind not in ("lyingcurl", "chestbench", "pullupside") else (-11, 8)
        if kind in ("calf", "seatedcalf", "calfmachine"):
            dx, dy = 19, 235-ankle[1]
        p.line(ankle, (ankle[0]+dx, min(244, ankle[1]+dy)), fill=TEAL, width=7)
    p.line(hip, shoulder, fill=NAVY, width=16)
    p.line(near_hip, knee, ankle, fill=TEAL, width=9)
    p.line(near_shoulder, elbow, hand, fill=NAVY, width=8)
    for point in (knee, elbow):
        p.dot(point, 4, WHITE)
    horizontal = hip[0] - shoulder[0]
    if abs(horizontal) > 36:
        head = (shoulder[0] + (-22 if horizontal > 0 else 22), shoulder[1]-12)
    else:
        head = (shoulder[0], shoulder[1]-23)
    p.line(shoulder, head, fill=NAVY, width=5)
    p.dot(head, 13, NAVY)
    p.dot((head[0], head[1]-1), 9, PANEL)
    if kind in BAR:
        point = hip if kind == "hipbench" else (shoulder[0]-8, shoulder[1]-4) if kind == "backbar" else hand
        x, y = point
        p.line((x-19, y), (x+19, y), fill=AMBER, width=4)
        for side in (-1, 1):
            p.line((x+14*side, y-9), (x+14*side, y+9), fill=AMBER, width=6)
    elif kind in DUMBBELL:
        hands = [hand, (320-hand[0], hand[1])] if frontal else [hand]
        for x, y in hands:
            if kind == "hammer":
                p.line((x, y-14), (x, y+14), fill=AMBER, width=6)
                p.line((x-7, y-11), (x+7, y-11), fill=AMBER, width=6)
                p.line((x-7, y+11), (x+7, y+11), fill=AMBER, width=6)
            else:
                p.line((x-13, y), (x+13, y), fill=AMBER, width=5)
                p.line((x-9, y-7), (x-9, y+7), fill=AMBER, width=5)
                p.line((x+9, y-7), (x+9, y+7), fill=AMBER, width=5)


def render():
    html = (ROOT / "index.html").read_text()
    built_in = set(re.findall(r'"([^"]+)"', html.split("const BASE_MENU=")[1].split("const startWeights")[0]))
    catalog = {}
    for name, kind, start, finish, first, second in DEMOS:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        file = f"{slug}.webp"
        image = Image.new("RGB", (640*SCALE, 264*SCALE), PANEL)
        for phase, encoded in enumerate((first, second)):
            panel = Panel(image, phase*320)
            panel.text((12, 10), ("1  START", "2  FINISH")[phase], 14)
            panel.line((22, 248), (298, 248), width=2)
            joints = points(encoded)
            equipment(panel, kind, joints)
            figure(panel, kind, joints)
        Panel(image, 0).line((319, 0), (319, 264), fill=WHITE, width=4)
        image.save(ASSETS / file, "WEBP", quality=83, method=6)
        catalog[name] = {"file": f"exercise-images/{file}", "label": name, "start": start, "finish": finish}
    if built_in != set(catalog) or len(DEMOS) != len(catalog):
        raise SystemExit(f"Catalog differs from built-in menu: {built_in ^ set(catalog)}")
    (ASSETS / "catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    render()
