# 西南交通大学评教系统 · 前后端接口对接规范文档
> **版本**：v1.0.0  
> **协议规范**：RESTful JSON API / HTTPS  
> **数据传输编码**：UTF-8  

本文档供后端研发人员（Spring Boot / FastAPI / Go / Express 等）参考，详细说明前端当前的数据结构、所需 RESTful 接口规格、字段校验要求，以及前端接入真实 API 的落地代码示例。

---

## 目录
1. [协议与统一响应规范](#1-协议与统一响应规范)
2. [核心数据模型 (Data Models)](#2-核心数据模型-data-models)
3. [RESTful 接口清单及请求/响应规格](#3-restful-接口清单及请求响应规格)
   - [3.1 教师信息与检索模块](#31-教师信息与检索模块)
   - [3.2 学生评价与打分模块](#32-学生评价与打分模块)
   - [3.3 智能多维推荐引擎](#33-智能多维推荐引擎)
   - [3.4 用户与积分中心模块](#34-用户与积分中心模块)
   - [3.5 校园 AI 评教助手](#35-校园-ai-评教助手)
4. [前端接入步骤指南 (Frontend Integration)](#4-前端接入步骤指南-frontend-integration)
5. [跨域 (CORS) 与本地联调配置](#5-跨域-cors-与本地联调配置)

---

## 1. 协议与统一响应规范

### 1.1 HTTP Headers
- `Content-Type: application/json; charset=utf-8`
- `Authorization: Bearer <JWT_TOKEN>`（需要用户身份鉴权的接口携带）

### 1.2 统一响应体结构
所有接口均应返回统一格式的 JSON 报文：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

**通用状态码约定：**
| HTTP 状态码 | 业务 code | 说明 |
| :--- | :--- | :--- |
| `200 OK` | `200` | 业务执行成功 |
| `400 Bad Request` | `40001` | 参数校验不通过（如评价维度评分不在 1-5 范围内） |
| `401 Unauthorized` | `40101` | 未登录或 Token 已过期 |
| `403 Forbidden` | `40301` | 积分不足或无权操作 |
| `404 Not Found` | `40401` | 找不到目标教师或评价记录 |
| `500 Internal Server Error` | `50001` | 后端服务内部异常 |

---

## 2. 核心数据模型 (Data Models)

前端 TypeScript 完整数据模型位于 `src/types.ts`，后端数据库建表及 DTO 需对齐以下字段：

### 2.1 教师六维雷达评分 (`TeacherDimensions`)
取值范围均为浮点数 `1.0 ~ 5.0`，综合评分为该六项的加权平均：
```typescript
interface TeacherDimensions {
  attendanceStrictness: number; // 点名严格度 (1 = 从不点名, 5 = 逢课必点)
  gradingLeniency: number;      // 给分大方度 (1 = 杀手给分低, 5 = 整体给分大方)
  effortMatters: number;        // 付出回报比 (1 = 躺平拿高分, 5 = 必须认真投入)
  workloadDifficulty: number;   // 作业与平时负担 (1 = 极少作业, 5 = 作业繁重烧脑)
  approachability: number;      // 亲和好沟通度 (1 = 严肃难沟通, 5 = 亲和友善好相处)
  teachingQuality: number;      // 教学干货质量 (1 = 照念PPT, 5 = 干货满满讲得透)
}
```

### 2.2 教师实体 (`Teacher`)
```typescript
interface Teacher {
  id: string;                      // 唯一ID (如 "t_1")
  name: string;                    // 教师姓名 (如 "李强")
  title: string;                   // 职称: "教授" | "副教授" | "讲师"
  college: string;                 // 院系名称 (如 "数学学院")
  campus: '犀浦校区' | '九里校区';  // 校区
  courses: string[];               // 主讲课程列表 (如 ["高等数学A", "线性代数"])
  isTeachingThisTerm: boolean;     // 本学期是否开课 (智能推荐池硬性过滤条件)
  overallScore: number;            // 综合评分 (如 4.8)
  reviewCount: number;             // 真实评价累计条数
  dimensions: TeacherDimensions;   // 聚合后的六维均分
  hasHistoricalData: boolean;      // 是否包含 2024 年前老站迁移沉淀数据
  tags: string[];                  // 评价标签 (如 ["从不点名", "期末给分好", "高数名师"])
  recentTermCourses?: string[];    // 本学期具体授课课程
}
```

### 2.3 学生评价记录 (`Review`)
```typescript
interface Review {
  id: string;                      // 评价ID (如 "rev_101")
  teacherId: string;               // 对应教师ID
  courseName: string;              // 评教对应课程
  yearTerm: string;                // 上课学期 (如 "2024-2025-1")
  dimensions: Partial<TeacherDimensions>; // 本次打分(可部分打分或全打分)
  comment?: string;                // 文本点评内容 (不少于10字)
  authorNickname: string;          // 匿名昵称 (如 "犀浦小火车")
  isHistoricalMigrated?: boolean;  // 是否为迁移历史数据
  status: 'approved' | 'pending' | 'rejected'; // 审核状态
  createdAt: string;               // 提交时间 (如 "2025-01-15" 或 ISO8601)
  likes: number;                   // 点赞数
}
```

### 2.4 积分流水记录 (`UserPointTransaction`)
```typescript
interface UserPointTransaction {
  id: string;                      // 流水ID
  action: string;                  // 行为说明 (如 "撰写教师评价通过审核 (+20分)")
  amount: number;                  // 积分变动 (+20 / +5 / -5)
  timestamp: string;               // 发生时间 (如 "14:20" 或 "2025-05-12 14:20")
  balanceAfter: number;            // 变动后的积分余额
}
```

---

## 3. RESTful 接口清单及请求/响应规格

### 3.1 教师信息与检索模块

#### ① 获取教师列表（支持多维度搜索与筛选）
- **接口路径**：`GET /api/teachers`
- **是否需鉴权**：否（公开访问）
- **Query 参数**：
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | `search` | string | 否 | 搜索关键字（模糊匹配姓名、课程名或标签） |
  | `college` | string | 否 | 院系名称（如 "全部学院"、"计算机与人工智能学院"） |
  | `onlyThisTerm` | boolean | 否 | 仅查看本学期开课教师（`true` / `false`） |
  | `campus` | string | 否 | 校区过滤（"犀浦校区" / "九里校区"） |
  | `sortBy` | string | 否 | 排序规则：`overall`(综合)、`leniency`(给分大方)、`quality`(教学干货)、`attendance`(不点名) |
  | `page` | number | 否 | 页码，默认 1 |
  | `pageSize` | number | 否 | 每页条数，默认 20 |

- **Response 响应体示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "t_1",
        "name": "李强",
        "title": "教授",
        "college": "数学学院",
        "campus": "犀浦校区",
        "courses": ["高等数学A", "线性代数B"],
        "isTeachingThisTerm": true,
        "overallScore": 4.9,
        "reviewCount": 128,
        "dimensions": {
          "attendanceStrictness": 1.2,
          "gradingLeniency": 4.9,
          "effortMatters": 4.5,
          "workloadDifficulty": 2.1,
          "approachability": 4.8,
          "teachingQuality": 4.9
        },
        "hasHistoricalData": true,
        "tags": ["从不点名", "期末给分好", "高数名师", "课堂风趣"]
      }
    ],
    "total": 48
  }
}
```

---

#### ② 获取教师详情及六维评分
- **接口路径**：`GET /api/teachers/{id}`
- **是否需鉴权**：否
- **Path 参数**：`id` (教师唯一标识，如 `t_1`)
- **Response 响应体**：返回对应的完整 `Teacher` 对象。

---

### 3.2 学生评价与打分模块

#### ① 获取指定教师的学生评价列表
- **接口路径**：`GET /api/teachers/{id}/reviews`
- **是否需鉴权**：否
- **Path 参数**：`id` (教师唯一标识)
- **Query 参数**：`page`, `pageSize`, `sortBy`（`latest` / `hottest`）
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "rev_1",
        "teacherId": "t_1",
        "courseName": "高等数学A",
        "yearTerm": "2024-2025-1",
        "dimensions": {
          "attendanceStrictness": 1,
          "gradingLeniency": 5,
          "effortMatters": 4,
          "workloadDifficulty": 2,
          "approachability": 5,
          "teachingQuality": 5
        },
        "comment": "李老师讲课非常生动！期末会给很多复习指导，平时从不突然点名，只要认真做作业期末绩点超高！",
        "authorNickname": "犀浦高数信徒",
        "isHistoricalMigrated": false,
        "status": "approved",
        "createdAt": "2025-01-10",
        "likes": 42
      }
    ],
    "total": 128
  }
}
```

---

#### ② 提交教师评价与六维打分 (核心业务)
- **接口路径**：`POST /api/reviews`
- **是否需鉴权**：是（`Authorization: Bearer <token>`）
- **业务规则**：
  - 评价提交成功后，后端自动为当前用户增加 **+20 积分**；
  - 自动重新计算目标教师的六维均分与综合评分；
  - 需记录一条积分变动流水到用户流水表。
- **Request Body 示例**：
```json
{
  "teacherId": "t_1",
  "courseName": "高等数学A",
  "yearTerm": "2024-2025-2",
  "dimensions": {
    "attendanceStrictness": 1,
    "gradingLeniency": 5,
    "effortMatters": 4,
    "workloadDifficulty": 2,
    "approachability": 5,
    "teachingQuality": 5
  },
  "comment": "李老师的课超级抢手，第一周建议早点到教室占前排，课后有答疑群很负责！",
  "authorNickname": "犀浦小火车"
}
```
- **Response 响应体示例**：
```json
{
  "code": 200,
  "message": "评价已提交并审核通过，积分 +20！",
  "data": {
    "reviewId": "rev_20260915_001",
    "status": "approved",
    "pointsAwarded": 20,
    "currentBalance": 145
  }
}
```

---

#### ③ 评价点赞
- **接口路径**：`POST /api/reviews/{id}/like`
- **Path 参数**：`id` (评价唯一标识)
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "点赞成功",
  "data": {
    "likes": 43
  }
}
```

---

### 3.3 智能多维推荐引擎

#### ① 基于权重偏好的排课选课推荐
- **接口路径**：`POST /api/recommend/teachers`
- **是否需鉴权**：否
- **说明**：前端滑动条调整 6 维权重（1~5分）和目标课程，后端候选池只筛查 `isTeachingThisTerm: true` 的本学期开课教师，按加权欧式距离或余弦相似度算法排序返回匹配度最高的 Top 3 教师。
- **Request Body**：
```json
{
  "courseName": "高等数学A",
  "weights": {
    "attendanceStrictness": 1, // 越低代表越期望不点名
    "gradingLeniency": 5,      // 期望给分大方
    "effortMatters": 4,
    "workloadDifficulty": 2,   // 期望作业少
    "approachability": 5,
    "teachingQuality": 5
  }
}
```
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "teacher": { /* Teacher 实体 */ },
      "matchScore": 96.5,
      "recommendReason": "本学期开课，给分极高（4.9分），从不随机点名，符合您的选课偏好！"
    }
  ]
}
```

---

### 3.4 用户与积分中心模块

#### ① 获取当前用户信息与积分
- **接口路径**：`GET /api/user/profile`
- **是否需鉴权**：是
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "u_8848",
    "nickname": "犀浦小火车",
    "campus": "犀浦校区",
    "points": 125,
    "hasCheckedInToday": false,
    "role": "student"
  }
}
```

---

#### ② 每日签到（+5积分）
- **接口路径**：`POST /api/user/check-in`
- **是否需鉴权**：是
- **业务规则**：每个用户每日限签一次，签到成功后增加 +5 积分并写入流水。
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "签到成功，获得 5 积分！",
  "data": {
    "pointsAdded": 5,
    "balance": 130,
    "hasCheckedInToday": true
  }
}
```

---

#### ③ 获取用户积分流水账单
- **接口路径**：`GET /api/user/transactions`
- **是否需鉴权**：是
- **Response 响应体**：返回 `UserPointTransaction[]` 列表。

---

### 3.5 校园 AI 评教助手

#### ① AI 智能问答 / 导师咨询
- **接口路径**：`POST /api/ai/chat`
- **是否需鉴权**：是（若设计每次提问扣除 5 积分）
- **Request Body**：
```json
{
  "prompt": "大一刚入学，高数哪个老师给分好？另外英语选谁比较轻松？",
  "history": [
    { "sender": "user", "content": "你好" },
    { "sender": "assistant", "content": "同学你好！我是西南交大选课智能顾问..." }
  ]
}
```
- **Response 响应体**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "reply": "大一高数强烈推荐【数学学院 李强教授】，六维雷达显示给分大方度高达 4.9，且平时不点名，干货满满；英语科目推荐【外国语学院 陈思讲师】，课堂互动轻松，作业以口语短视频为主。",
    "citedTeachers": [
      {
        "id": "t_1",
        "name": "李强",
        "course": "高等数学A",
        "reason": "给分大方度 4.9，学生好评率 98%"
      },
      {
        "id": "t_3",
        "name": "陈思",
        "course": "大学英语III",
        "reason": "考核形式亲民，平时作业负担极低"
      }
    ],
    "deductedPoints": 5,
    "remainingPoints": 125
  }
}
```

---

## 4. 前端接入步骤指南 (Frontend Integration)

前端工程为现代 Vite + React + TypeScript 架构，将现有的前端 Mock 数据切换为真实后端 API 只需以下三步：

### 第一步：在前端创建统一网络请求工具
在前端工程中新建 `src/api/client.ts`：

```typescript
// src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('swjtu_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP Error ${response.status}: ${errorText}`);
  }

  const result: ApiResponse<T> = await response.json();
  if (result.code !== 200) {
    throw new Error(result.message || '业务请求失败');
  }

  return result.data;
}
```

### 第二步：编写模块化 API 服务
新建 `src/api/teacherService.ts`：

```typescript
// src/api/teacherService.ts
import { request } from './client';
import { Teacher, Review } from '../types';

export const TeacherService = {
  // 1. 获取教师列表
  getTeachers: (params?: { search?: string; college?: string; onlyThisTerm?: boolean; sortBy?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.college && params.college !== '全部学院') query.append('college', params.college);
    if (params?.onlyThisTerm) query.append('onlyThisTerm', 'true');
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    return request<{ list: Teacher[]; total: number }>(`/teachers?${query.toString()}`);
  },

  // 2. 获取指定教师的真实评价
  getTeacherReviews: (teacherId: string) => {
    return request<{ list: Review[]; total: number }>(`/teachers/${teacherId}/reviews`);
  },

  // 3. 提交评价
  submitReview: (reviewData: Omit<Review, 'id' | 'createdAt' | 'likes'>) => {
    return request<{ reviewId: string; pointsAwarded: number; currentBalance: number }>('/reviews', {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  },

  // 4. 评价点赞
  likeReview: (reviewId: string) => {
    return request<{ likes: number }>(`/reviews/${reviewId}/like`, { method: 'POST' });
  },

  // 5. 每日签到
  checkIn: () => {
    return request<{ pointsAdded: number; balance: number }>('/user/check-in', { method: 'POST' });
  },
};
```

### 第三步：在 `src/App.tsx` 中将 Mock 数据替换为接口调用
只需在 `App.tsx` 的初始生命周期中加入数据拉取：

```typescript
// src/App.tsx 中替换 INITIAL_TEACHERS 与 INITIAL_REVIEWS
useEffect(() => {
  TeacherService.getTeachers()
    .then((res) => {
      if (res.list && res.list.length > 0) {
        setTeachers(res.list);
      }
    })
    .catch((err) => console.error('加载教师数据失败:', err));
}, []);
```

---

## 5. 跨域 (CORS) 与本地联调配置

在本地开发阶段，若您的独立后端运行在 `http://localhost:8080`（如 Java Spring Boot）或 `http://localhost:8000`（FastAPI），可在前端根目录的 `vite.config.ts` 中开启代理，避免浏览器跨域拦截：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // 您的后端服务实际运行地址
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // 若后端接口不带 /api 前缀则开启此行
      },
    },
  },
});
```

在生产环境部署时，推荐由 Nginx 统一反向代理：
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location / {
    root /var/www/swjtu-rate-teacher/dist;
    try_files $uri $uri/ /index.html;
}
```

---

**说明**：以上接口协议完全与当前前端视图（包括手机夸克模式与电脑宽屏模式、教师六维雷达、多维选课推荐引擎、积分中心、AI 问答）100% 契合。后端开发者可依据本规范无缝联调。
