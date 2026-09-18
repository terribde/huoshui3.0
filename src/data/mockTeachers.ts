import { Teacher, Review } from '../types';

export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 't_001',
    name: '张立新',
    title: '教授',
    college: '计算机与人工智能学院',
    campus: '犀浦校区',
    courses: ['数据结构与算法', '高级程序设计语言', '算法设计与分析'],
    isTeachingThisTerm: true,
    overallScore: 4.8,
    reviewCount: 78,
    hasHistoricalData: true,
    tags: ['给分大方', '码农导师', '干货满满', '从不点名'],
    dimensions: {
      attendanceStrictness: 1.5, // 极少点名
      gradingLeniency: 4.8,      // 给分很大方
      effortMatters: 4.2,        // 认真写的实验给满分
      workloadDifficulty: 3.2,   // 编程作业量适中
      approachability: 4.9,      // 极具亲和力
      teachingQuality: 4.7       // 讲课条理分明
    },
    recentTermCourses: ['数据结构与算法 (A班)', '高级程序设计语言 (卓越班)']
  },
  {
    id: 't_002',
    name: '李建军',
    title: '副教授',
    college: '数学学院',
    campus: '犀浦校区',
    courses: ['高等数学 (I)', '微积分 (B)', '线性代数'],
    isTeachingThisTerm: true,
    overallScore: 4.6,
    reviewCount: 142,
    hasHistoricalData: true,
    tags: ['板书一流', '每节必点名', '期末送分题', '负责任'],
    dimensions: {
      attendanceStrictness: 4.8, // 几乎每次签到
      gradingLeniency: 4.2,      // 卷面扣得细但平时分给满
      effortMatters: 4.7,        // 作业全写必有回报
      workloadDifficulty: 3.8,   // 每周一套课后习题
      approachability: 4.3,      // 课后耐心答疑
      teachingQuality: 4.9       // 高数封神板书
    },
    recentTermCourses: ['高等数学 (I) 03班', '微积分 (B) 01班']
  },
  {
    id: 't_003',
    name: '王雪梅',
    title: '教授',
    college: '马克思主义学院',
    campus: '犀浦校区',
    courses: ['思想道德与法治', '中国近现代史纲要', '形势与政策'],
    isTeachingThisTerm: true,
    overallScore: 4.9,
    reviewCount: 96,
    hasHistoricalData: true,
    tags: ['神仙老师', '从不随机点名', '小论文给高分', '课堂互动生动'],
    dimensions: {
      attendanceStrictness: 1.8, // 偶有雨课堂暗号
      gradingLeniency: 4.9,      // 几乎全班均分90+
      effortMatters: 3.2,        // 只要写得真诚就高分
      workloadDifficulty: 1.5,   // 期末一篇感悟心得
      approachability: 4.9,      // 温柔和蔼
      teachingQuality: 4.8       // 听课像听故事
    },
    recentTermCourses: ['中国近现代史纲要 07班']
  },
  {
    id: 't_004',
    name: '陈宇宏',
    title: '教授',
    college: '土木工程学院',
    campus: '九里校区',
    courses: ['理论力学', '材料力学', '结构力学'],
    isTeachingThisTerm: true,
    overallScore: 4.1,
    reviewCount: 65,
    hasHistoricalData: true,
    tags: ['四大力学杀手', '极度严格', '考研必选', '必须认真'],
    dimensions: {
      attendanceStrictness: 4.9, // 严格按名单点名
      gradingLeniency: 2.3,      // 给分极其严格
      effortMatters: 5.0,        // 必须全力以赴否则挂科
      workloadDifficulty: 4.8,   // 课后作业手绘受力图超多
      approachability: 3.5,      // 不苟言笑但专业过硬
      teachingQuality: 4.6       // 逻辑极为严密
    },
    recentTermCourses: ['理论力学 (A) 02班', '材料力学 01班']
  },
  {
    id: 't_005',
    name: '刘晓峰',
    title: '副教授',
    college: '物理科学与技术学院',
    campus: '犀浦校区',
    courses: ['大学物理 (I)', '大学物理 (II)', '大学物理实验'],
    isTeachingThisTerm: true,
    overallScore: 4.5,
    reviewCount: 88,
    hasHistoricalData: true,
    tags: ['大物救星', '考前划重点', '实验指导细致', '不为难学生'],
    dimensions: {
      attendanceStrictness: 2.5, // 偶尔抽查
      gradingLeniency: 4.4,      // 捞人有一手
      effortMatters: 4.0,        // 重点题目写了就有分
      workloadDifficulty: 2.8,   // 适度题量
      approachability: 4.6,      // 群里秒回答疑
      teachingQuality: 4.4       // 动画生动
    },
    recentTermCourses: ['大学物理 (I) 05班']
  },
  {
    id: 't_006',
    name: '赵天成',
    title: '讲师',
    college: '外国语学院',
    campus: '犀浦校区',
    courses: ['大学英语 (III)', '学术英语写作', '英语视听说'],
    isTeachingThisTerm: true,
    overallScore: 4.7,
    reviewCount: 52,
    hasHistoricalData: false, // 纯新评价
    tags: ['发音标准', '给分爽快', '口语练习多', '年轻有活力'],
    dimensions: {
      attendanceStrictness: 2.0,
      gradingLeniency: 4.6,
      effortMatters: 3.8,
      workloadDifficulty: 2.2,
      approachability: 4.8,
      teachingQuality: 4.7
    },
    recentTermCourses: ['大学英语 (III) 12班']
  },
  {
    id: 't_007',
    name: '孙海波',
    title: '教授',
    college: '电气工程学院',
    campus: '犀浦校区',
    courses: ['电路分析', '模拟电子技术', '数字电子技术'],
    isTeachingThisTerm: false, // 本学期未开课（用于测试智能推荐过滤）
    overallScore: 4.3,
    reviewCount: 43,
    hasHistoricalData: true,
    tags: ['电气名师', '本学期休假', '给分中规中矩'],
    dimensions: {
      attendanceStrictness: 3.5,
      gradingLeniency: 3.6,
      effortMatters: 4.5,
      workloadDifficulty: 4.0,
      approachability: 4.1,
      teachingQuality: 4.6
    },
    recentTermCourses: []
  },
  {
    id: 't_008',
    name: '周雅婷',
    title: '副教授',
    college: '经济管理学院',
    campus: '犀浦校区',
    courses: ['西方经济学', '管理学原理', '财务报表分析'],
    isTeachingThisTerm: true,
    overallScore: 4.8,
    reviewCount: 61,
    hasHistoricalData: true,
    tags: ['商业案例超多', '课堂气氛活跃', '大作业好过', '给分大方'],
    dimensions: {
      attendanceStrictness: 2.2,
      gradingLeniency: 4.7,
      effortMatters: 3.9,
      workloadDifficulty: 2.6,
      approachability: 4.9,
      teachingQuality: 4.8
    },
    recentTermCourses: ['管理学原理 02班', '西方经济学 04班']
  }
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'r_001',
    teacherId: 't_001',
    courseName: '数据结构与算法',
    yearTerm: '2024春季',
    dimensions: {
      attendanceStrictness: 1,
      gradingLeniency: 5,
      effortMatters: 4,
      workloadDifficulty: 3,
      approachability: 5,
      teachingQuality: 5
    },
    comment: '张老师讲红黑树和B+树讲得太通透了！期末大作业如果是自己手写的算法，哪怕有bug老师也会给很高分，强烈推荐选他的课！',
    authorNickname: '犀浦搬砖喵',
    isHistoricalMigrated: false,
    status: 'approved',
    createdAt: '2024-06-28',
    likes: 34
  },
  {
    id: 'r_002',
    teacherId: 't_001',
    courseName: '数据结构与算法',
    yearTerm: '2023秋季 (原站迁移)',
    dimensions: {
      approachability: 5,
      teachingQuality: 5
    },
    comment: '【历史迁移数据】老站好评榜第一名，老师从不刁难学生，平时分给得很大方。',
    authorNickname: '匿名交大校友',
    isHistoricalMigrated: true,
    status: 'approved',
    createdAt: '2023-12-15',
    likes: 18
  },
  {
    id: 'r_003',
    teacherId: 't_002',
    courseName: '高等数学 (I)',
    yearTerm: '2024秋季',
    dimensions: {
      attendanceStrictness: 5,
      gradingLeniency: 4,
      effortMatters: 5,
      workloadDifficulty: 4,
      approachability: 4,
      teachingQuality: 5
    },
    comment: '李老师的板书简直是艺术品，整整三块黑板推导微积分基本定理。每节课都签到，但只要作业认真交，期末绝对不会卡人！',
    authorNickname: '高数必须90+',
    isHistoricalMigrated: false,
    status: 'approved',
    createdAt: '2025-01-10',
    likes: 42
  },
  {
    id: 'r_004',
    teacherId: 't_003',
    courseName: '中国近现代史纲要',
    yearTerm: '2024春季',
    dimensions: {
      attendanceStrictness: 2,
      gradingLeniency: 5,
      effortMatters: 3,
      workloadDifficulty: 1,
      approachability: 5,
      teachingQuality: 5
    },
    comment: '思政课里的天花板！王老师说话特别温柔，讲课很有见地，一点都不枯燥。期末小论文按时交，平时分98，爱死王老师了。',
    authorNickname: '虹桥路旁小路灯',
    isHistoricalMigrated: false,
    status: 'approved',
    createdAt: '2024-06-20',
    likes: 56
  },
  {
    id: 'r_005',
    teacherId: 't_004',
    courseName: '理论力学',
    yearTerm: '2023秋季 (原站迁移)',
    dimensions: {
      approachability: 3,
      teachingQuality: 5
    },
    comment: '【历史迁移数据】陈老师是出了名的严，想混学分的千万别选，但要考土木研的选他保你力学功底扎实到飞起。',
    authorNickname: '九里桥头土木魂',
    isHistoricalMigrated: true,
    status: 'approved',
    createdAt: '2023-11-02',
    likes: 29
  },
  {
    id: 'r_006',
    teacherId: 't_005',
    courseName: '大学物理 (I)',
    yearTerm: '2024秋季',
    dimensions: {
      attendanceStrictness: 2,
      gradingLeniency: 5,
      effortMatters: 4,
      workloadDifficulty: 3,
      approachability: 5,
      teachingQuality: 4
    },
    comment: '刘老师期末复习课一定要去听！把重点圈得很清楚，平时在微信答疑群里回复极快。给分也很捞人。',
    authorNickname: '物理不及格患者',
    isHistoricalMigrated: false,
    status: 'approved',
    createdAt: '2025-01-08',
    likes: 31
  },
  {
    id: 'r_pending_001',
    teacherId: 't_002',
    courseName: '高等数学 (I)',
    yearTerm: '2024-2025第1学期',
    dimensions: {
      attendanceStrictness: 4,
      gradingLeniency: 3,
      effortMatters: 5,
      workloadDifficulty: 4,
      approachability: 4,
      teachingQuality: 5
    },
    comment: '李老师讲微积分定理证明非常严密，每节课板书都工工整整。期末给分比较严格，全凭卷面成绩，但只要平时作业都自己认真写、考前刷完老师给的样卷，拿85+没问题！',
    authorNickname: '交大24级小萌新',
    isHistoricalMigrated: false,
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    likes: 0
  },
  {
    id: 'r_pending_002',
    teacherId: 't_006',
    courseName: '大学英语 (III)',
    yearTerm: '2024-2025第1学期',
    dimensions: {
      attendanceStrictness: 2,
      gradingLeniency: 5,
      effortMatters: 4,
      workloadDifficulty: 2,
      approachability: 5,
      teachingQuality: 5
    },
    comment: '赵老师上课超级风趣！每节课都有10分钟小组口语自由展示，完全没有压力。考勤会每两周抽查一次，给分很客观，平时活跃的同学平时分都是满分！强烈推荐大家选！',
    authorNickname: '九里校区大白鹅',
    isHistoricalMigrated: false,
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    likes: 0
  }
];

export const SWJTU_COLLEGES = [
  '全部学院',
  '计算机与人工智能学院',
  '数学学院',
  '马克思主义学院',
  '土木工程学院',
  '物理科学与技术学院',
  '外国语学院',
  '电气工程学院',
  '机械工程学院',
  '经济管理学院',
  '交通运输与物流学院'
];

export const POPULAR_COURSES = [
  '高等数学 (I)',
  '数据结构与算法',
  '大学物理 (I)',
  '微积分 (B)',
  '中国近现代史纲要',
  '理论力学',
  '线性代数',
  '管理学原理'
];
