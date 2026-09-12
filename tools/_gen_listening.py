# -*- coding: utf-8 -*-
import os, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_dir = os.path.join(root, 'assets', 'data')

# 沿用 voiceplayer.js 的 SCENES 结构：{ key:{ t:'标题', lines:[{en,zh}, ...] } }
SCENES = {
    "news": {
        "t": "短篇新闻 · 校园节能倡议",
        "lines": [
            {"en": "A new green-energy plan was launched at the university this week.",
             "zh": "本周这所大学启动了一项新的绿色能源计划。"},
            {"en": "The school will replace old lights with smart LEDs in all classrooms.",
             "zh": "学校将把所有教室的旧灯具更换为智能 LED 灯。"},
            {"en": "Students are asked to turn off unused devices before leaving the lab.",
             "zh": "学校呼吁学生在离开实验室前关闭未使用的设备。"},
            {"en": "Officials say the change may cut electricity use by about twenty percent.",
             "zh": "校方表示，这一改变可使用电量降低约百分之二十。"},
            {"en": "A student club will check the results and share a monthly report.",
             "zh": "一个学生社团将核查成效并发布月度报告。"},
            {"en": "The plan will run for one term as a trial before a wider rollout.",
             "zh": "该计划先试行一个学期，之后再考虑全面推广。"}
        ]
    },
    "longconv": {
        "t": "长对话 · 求职面试约时间",
        "lines": [
            {"en": "A: Hello, this is the hiring team. May I speak with Miss Lin?",
             "zh": "A：您好，这里是招聘组，请问能找林女士听电话吗？"},
            {"en": "B: Speaking. Thanks for calling me about the interview.",
             "zh": "B：我就是。谢谢您打来通知我面试的事。"},
            {"en": "A: We would like to meet you next Tuesday at ten in the morning.",
             "zh": "A：我们想约您下周二上午十点见面。"},
            {"en": "B: Tuesday at ten works for me. Where should I go?",
             "zh": "B：周二上午十点可以，我该去哪里？"},
            {"en": "A: Please come to Room 305 on the third floor of the office building.",
             "zh": "A：请到办公楼三楼 305 室。"},
            {"en": "B: Got it. Should I bring my resume and a notebook?",
             "zh": "B：明白了。我需要带简历和笔记本吗？"},
            {"en": "A: Yes, and a copy of your certificate would be helpful too.",
             "zh": "A：要的，另外带上一份证书复印件也会有帮助。"},
            {"en": "B: Sure, I will arrive ten minutes early. See you then.",
             "zh": "B：好的，我会提前十分钟到，到时见。"}
        ]
    },
    "passage": {
        "t": "篇章理解 · 时间管理的两个习惯",
        "lines": [
            {"en": "Good time management is not about doing more, but doing what matters.",
             "zh": "良好的时间管理不在于做更多事，而在于做重要的事。"},
            {"en": "First, write down the three most important tasks the night before.",
             "zh": "首先，在前一晚写下三件最重要的事。"},
            {"en": "This helps your brain focus before the busy day begins.",
             "zh": "这能让大脑在忙碌的一天开始前就聚焦重点。"},
            {"en": "Second, group small jobs together and finish them in one short block.",
             "zh": "其次，把零碎的小事集中起来，用一小段时间一并处理。"},
            {"en": "Checking email only twice a day can save a lot of lost attention.",
             "zh": "每天只在两个固定时段查邮件，能省下大量被分散的注意力。"},
            {"en": "Many students find they feel calmer and finish earlier with this method.",
             "zh": "许多学生发现，用这个方法后他们更从容，也能更早完成任务。"},
            {"en": "The key is to plan, then protect your focus from small interruptions.",
             "zh": "关键在于先规划，再保护自己的专注不被小事打断。"},
            {"en": "Try it for one week and see if your week feels more in your control.",
             "zh": "试上一个星期，看看这一周是否更在你的掌控之中。"}
        ]
    }
}

out = {
    "version": "20260913a",
    "comment": "听力三题型扩展（短篇新闻/长对话/篇章理解），结构沿用 voiceplayer.js 的 SCENES：t + lines[{en,zh}]。接线由工程师完成。",
    "scenes": SCENES
}
path = os.path.join(data_dir, "listening-ext.json")
json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
log = os.path.join(root, '_gen_listening.log')
open(log, 'w', encoding='utf-8').write('SCENES=%d\nLINES=%s\n' % (
    len(SCENES), {k: len(v['lines']) for k, v in SCENES.items()}))
