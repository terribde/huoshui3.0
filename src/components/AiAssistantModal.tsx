import React, { useState, useRef, useEffect } from 'react';
import { Teacher, AiChatMessage } from '../types';
import { Bot, Send, Sparkles, User, AlertCircle, X, HelpCircle, CornerDownRight, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  userPoints: number;
  onDeductPoints: (amount: number, reason: string) => boolean;
  onSelectTeacher: (teacher: Teacher) => void;
  initialPrompt?: string;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  teachers,
  userPoints,
  onDeductPoints,
  onSelectTeacher,
  initialPrompt,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      content: '你好！我是交大教师评价助手。基于全校真实评价数据库，你可以问我任何选课、老师点名情况、给分风格等问题（例如：“哪位高数老师不点名还给高分？”、“土木力学课推荐谁？”）。\n每次智能问答消耗 2 积分。',
      timestamp: '刚刚',
    }
  ]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt && isOpen) {
      setInputValue(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickPrompts = [
    '推荐给分大方、很少点名的通识课老师',
    '计算机学院哪位老师讲数据结构最通透？',
    '高等数学想考90分以上保研选谁？',
    '土木力学想考研选陈宇宏老师合适吗？'
  ];

  // Simulated RAG Answer Generator using real local Teacher records
  const generateRAGResponse = (query: string): { content: string; citedTeachers?: any[] } => {
    const q = query.toLowerCase();

    // Query analysis
    if (q.includes('不点名') || q.includes('很少点名') || q.includes('签到')) {
      const laxTeachers = teachers
        .filter((t) => t.dimensions.attendanceStrictness <= 2.2)
        .sort((a, b) => a.dimensions.attendanceStrictness - b.dimensions.attendanceStrictness);

      const topT = laxTeachers.slice(0, 3);
      return {
        content: `根据全校真实评价库与打分统计，以下老师在【点名/签到严格度】维度上最友好（得分均 ≤ 2.2 分）：\n\n1. **${topT[0]?.name}**（${topT[0]?.college}）：点名严格度仅 ${topT[0]?.dimensions.attendanceStrictness} 分，${topT[0]?.tags.join('、')}，学生反映极少随机抽查。\n2. **${topT[1]?.name}**（${topT[1]?.college}）：点名严格度 ${topT[1]?.dimensions.attendanceStrictness} 分，平时多采用课堂互动代替冰冷签到。\n\n提示：即使老师不点名，期末考核重点通常会融入课堂板书中，建议关键复习周务必听讲！`,
        citedTeachers: topT.map((t) => ({
          id: t.id,
          name: t.name,
          course: t.courses[0],
          reason: `点名严格度 ${t.dimensions.attendanceStrictness} 分 · 给分松紧度 ${t.dimensions.gradingLeniency} 分`
        }))
      };
    }

    if (q.includes('高数') || q.includes('微积分') || q.includes('数学')) {
      const mathTeachers = teachers.filter((t) => 
        t.college.includes('数学') || t.courses.some(c => c.includes('数学') || c.includes('微积分'))
      );
      const topMath = mathTeachers[0] || teachers[1];
      return {
        content: `针对【高等数学/微积分】，根据评价数据库分析推荐 **${topMath.name}**（${topMath.title}）：\n\n- **教学质量**：${topMath.dimensions.teachingQuality} / 5.0（极高），学生公认黑板板书极强，逻辑推导清晰，非常适合想要扎实掌握定理、冲刺高分保研的同学。\n- **考核风格**：点名较严（${topMath.dimensions.attendanceStrictness}分），但“给分是否看努力”高达 ${topMath.dimensions.effortMatters} 分，只要平时作业认真上交，期末绝不为难，平时分给得很足。\n- **本学期开课班级**：${topMath.recentTermCourses?.[0] || '高等数学(I)'}`,
        citedTeachers: [{
          id: topMath.id,
          name: topMath.name,
          course: topMath.courses[0],
          reason: `板书一流 · 综合评分 ${topMath.overallScore} · 评价 ${topMath.reviewCount} 条`
        }]
      };
    }

    if (q.includes('计算机') || q.includes('数据结构') || q.includes('算法')) {
      const csTeacher = teachers.find(t => t.college.includes('计算机')) || teachers[0];
      return {
        content: `在计算机专业课方面，**${csTeacher.name}** 教授在数据库中处于前列：\n\n- **特点**：给分大方（${csTeacher.dimensions.gradingLeniency}分）、极少点名（${csTeacher.dimensions.attendanceStrictness}分），亲和力满分（${csTeacher.dimensions.approachability}分）。\n- **考核建议**：老师注重编程实践能力，代码大作业如果能够独立手写并写出思路分析，通常都能拿到满绩点评价。\n- 本学期在犀浦校区主讲《${csTeacher.recentTermCourses?.[0] || '数据结构与算法'}》。`,
        citedTeachers: [{
          id: csTeacher.id,
          name: csTeacher.name,
          course: csTeacher.courses[0],
          reason: '极具亲和力 · 代码作业给分大方 · 从不点名'
        }]
      };
    }

    if (q.includes('土木') || q.includes('力学') || q.includes('陈宇宏')) {
      const civilTeacher = teachers.find(t => t.college.includes('土木')) || teachers[3];
      return {
        content: `关于土木力学与 **${civilTeacher.name}** 老师：\n\n- **风格定位**：陈老师属于标准的“治学严谨型”名师。点名极严格（${civilTeacher.dimensions.attendanceStrictness}分），给分松紧度仅 ${civilTeacher.dimensions.gradingLeniency} 分，不容许任何学术划水。\n- **考研适配**：由于课程质量高达 ${civilTeacher.dimensions.teachingQuality} 分，且“看努力程度”达到满分 5.0，想要考研深造土木力学的同学选他的课基础会极其过硬！如果是想轻松混学分的，慎选。`,
        citedTeachers: [{
          id: civilTeacher.id,
          name: civilTeacher.name,
          course: civilTeacher.courses[0],
          reason: '考研名师 · 严格负责 · 理论功底扎实'
        }]
      };
    }

    // Default intelligent response matching general teachers
    const bestOverall = [...teachers].sort((a, b) => b.overallScore - a.overallScore).slice(0, 2);
    return {
      content: `根据你提到的关键词，已检索校内评价库：\n\n综合评价高且给分友好的教师推荐：\n1. **${bestOverall[0]?.name}**（${bestOverall[0]?.college}）：综合 ${bestOverall[0]?.overallScore} 分，特点：${bestOverall[0]?.tags.join('、')}。\n2. **${bestOverall[1]?.name}**（${bestOverall[1]?.college}）：综合 ${bestOverall[1]?.overallScore} 分，开课科目包括 ${bestOverall[1]?.courses.join('、')}。\n\n你可以进一步追问具体课程或维度的详细情况！`,
      citedTeachers: bestOverall.map((t) => ({
        id: t.id,
        name: t.name,
        course: t.courses[0],
        reason: `综合评分 ${t.overallScore} · ${t.tags[0]}`
      }))
    };
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    // Check points (PRD: AI 问答消耗 2 积分)
    if (userPoints < 2) {
      alert('您的积分不足！提问需要消耗 2 积分。可通过每日签到(+5分)或提交教师评价(+20分)快速获取积分。');
      return;
    }

    const deducted = onDeductPoints(2, `AI 智能问答提问：“${text.slice(0, 15)}...”`);
    if (!deducted) return;

    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: '刚刚'
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    // Simulate RAG generation with brief delay
    setTimeout(() => {
      const responseData = generateRAGResponse(text);
      const assistantMsg: AiChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        content: responseData.content,
        timestamp: '刚刚',
        citedTeachers: responseData.citedTeachers
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);
    }, 600);
  };

  return (
    <div id="ai-assistant-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="ai-assistant-content" 
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-xl h-[85vh] sm:h-[80vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/70 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-base">交大教师评价 AI Agent</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  RAG 检索库
                </span>
              </div>
              <p className="text-xs text-gray-500">基于西南交大历史与最新学生实测数据回答</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 font-medium">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>{userPoints} 积分</span>
            </div>
            <motion.button 
              id="close-ai-assistant-btn"
              whileTap={{ scale: 0.88 }}
              onClick={onClose}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              
              <div className={`max-w-[85%] space-y-2.5 ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-xs p-3.5 text-sm shadow-xs'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-2xl rounded-tl-xs p-4 text-sm shadow-2xs'
              }`}>
                <div className="leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Cited teacher cards */}
                {msg.citedTeachers && msg.citedTeachers.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/60 space-y-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 block">
                      引用数据源教师：
                    </span>
                    <div className="space-y-1.5">
                      {msg.citedTeachers.map((ct) => {
                        const actualTeacher = teachers.find(t => t.id === ct.id);
                        return (
                          <motion.div
                            key={ct.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              if (actualTeacher) {
                                onSelectTeacher(actualTeacher);
                                onClose();
                              }
                            }}
                            className="p-2 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 transition-colors flex items-center justify-between cursor-pointer group text-xs text-gray-700"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 group-hover:text-indigo-600">
                                {ct.name}
                              </span>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-500">{ct.course}</span>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-500 text-[11px]">{ct.reason}</span>
                            </div>
                            <span className="text-indigo-600 font-medium text-[11px] flex items-center gap-0.5">
                              看评价 <CornerDownRight className="w-3 h-3" />
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 justify-start"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-xs p-3.5 text-xs text-gray-500 flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
                <span>正在检索教师评价库并生成回答...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompt suggestions */}
        <div className="px-4 py-2 bg-gray-50/80 border-t border-gray-100 overflow-x-auto scrollbar-none flex gap-2">
          {quickPrompts.map((prompt, idx) => (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSend(prompt)}
              className="text-xs whitespace-nowrap px-3 py-1 bg-white border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 rounded-full text-gray-600 transition-colors shadow-2xs"
            >
              {prompt}
            </motion.button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            id="ai-assistant-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="问问哪个老师不点名、给分好，或搜专业课老师..."
            className="flex-1 px-4 py-2.5 bg-gray-50 rounded-2xl border border-gray-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
          />
          <motion.button
            id="ai-assistant-send-btn"
            whileTap={{ scale: 0.94 }}
            disabled={!inputValue.trim() || isLoading}
            onClick={() => handleSend()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">发送</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
