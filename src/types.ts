export interface TeacherDimensions {
  attendanceStrictness: number; // 1 = 从不点名, 5 = 每次都点
  gradingLeniency: number;      // 1 = 杀手给分低, 5 = 整体给分大方
  effortMatters: number;        // 1 = 躺平拿高分, 5 = 必须认真投入
  workloadDifficulty: number;   // 1 = 极少作业, 5 = 作业繁重烧脑
  approachability: number;      // 1 = 严肃难沟通, 5 = 亲和友善好相处
  teachingQuality: number;      // 1 = 照念PPT, 5 = 干货满满讲得透
}

export interface Review {
  id: string;
  teacherId: string;
  courseName: string;
  yearTerm: string;
  dimensions: Partial<TeacherDimensions>;
  comment?: string;
  authorNickname: string;
  isHistoricalMigrated?: boolean; // 2024年前老站迁移数据
  status: 'approved' | 'pending' | 'rejected';
  createdAt: string;
  likes: number;
}

export interface Teacher {
  id: string;
  name: string;
  title: string; // 教授、副教授、讲师
  college: string; // 学院：计算机与人工智能学院、土木工程学院等
  campus: '犀浦校区' | '九里校区';
  courses: string[];
  isTeachingThisTerm: boolean; // 本学期是否开课（智能推荐候选池硬性条件）
  overallScore: number;
  reviewCount: number;
  dimensions: TeacherDimensions;
  hasHistoricalData: boolean; // 是否包含2024年前迁移数据
  tags: string[];
  recentTermCourses?: string[];
}

export interface RecommendationWeights {
  attendanceStrictness: number; // 倾向不点名(权重)
  gradingLeniency: number;      // 倾向给分大方(权重)
  effortMatters: number;        // 倾向付出会回报(权重)
  workloadDifficulty: number;   // 倾向作业少(权重)
  approachability: number;      // 倾向老师亲切(权重)
  teachingQuality: number;      // 倾向课程质量高(权重)
}

export interface UserPointTransaction {
  id: string;
  action: string;
  amount: number; // 正数获得，负数消耗
  timestamp: string;
  balanceAfter: number;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citedTeachers?: {
    id: string;
    name: string;
    course: string;
    reason: string;
  }[];
}

export interface UserProfile {
  id: string;
  email: string;
  nickname?: string;
  college?: string;
  campus?: string;
  points: number;
}

