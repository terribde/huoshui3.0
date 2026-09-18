/**
 * Automated Sensitive Words & Content Safety Pre-screening
 * 针对辱骂、脏话、人身攻击、广告引流、泄露个人隐私（手机号/微信号/住址）等自动前置拦截
 */

// 1. 人身攻击与脏话辱骂库
const ABUSIVE_WORDS = [
  '傻逼', '煞笔', '沙比', 'shabi', 'sb',
  '脑残', '弱智', '弱智儿', '智障', '脑瘫',
  '垃圾', '死全家', '滚蛋', '去死', '操你', '草泥马', '草你妈', 'cnm',
  '妈的', '他妈的', '狗东西', '畜生', '禽兽', '变态', '贱人',
  '下头男', '下头女', '恶心心', '恶心死', '司马', 'nmsl',
  '孤儿', '死爹', '死妈', '猪脑子', '废物', '杂种', '人渣',
  '臭不要脸', '狗逼', '混账', '恶毒', '装逼', '做作恶心',
  '叫兽', '学阀败类', '黑心导师'
];

// 2. 违规广告、黑产代写代考、兼职刷单
const AD_SPAM_WORDS = [
  '代写', '代考', '枪手', '期末保过', '买答案',
  '刷单', '兼职日结', '加微信', '加微', '加v', '加qq', 'vx:', 'wx:',
  '私聊我', '出原题', '挂科包过', '改分', '教务处改分',
  '论文代发', '菠菜', '赌博', '办证', '刻章发票', '招募兼职'
];

// 3. 隐私泄露敏感提示词
const PRIVACY_SENSITIVE_KEYWORDS = [
  '家庭住址', '家住', '身份证号', '门牌号', '私宅', '私人手机', '教师手机'
];

export interface SensitiveCheckResult {
  isClean: boolean;
  violations: string[];
  reason: string;
}

export function checkSensitiveContent(content: string): SensitiveCheckResult {
  if (!content || !content.trim()) {
    return { isClean: true, violations: [], reason: '' };
  }

  const normalized = content.toLowerCase().replace(/\s+/g, '');
  const hitViolations: string[] = [];

  // A. 检查人身攻击与脏话
  for (const word of ABUSIVE_WORDS) {
    if (normalized.includes(word.toLowerCase())) {
      hitViolations.push(word);
    }
  }

  // B. 检查广告代考等违规黑产词
  for (const word of AD_SPAM_WORDS) {
    if (normalized.includes(word.toLowerCase())) {
      hitViolations.push(word);
    }
  }

  // C. 检查隐私泄露敏感词
  for (const word of PRIVACY_SENSITIVE_KEYWORDS) {
    if (normalized.includes(word.toLowerCase())) {
      hitViolations.push(word);
    }
  }

  // D. 正则检查：11位中国大陆手机号码泄露（严禁在公开评价中发布个人手机号）
  const phoneRegex = /(?:(?:\+|00)86)?1[3-9]\d{9}/g;
  const phoneMatches = content.match(phoneRegex);
  if (phoneMatches && phoneMatches.length > 0) {
    hitViolations.push(`手机号信息 [${phoneMatches[0].slice(0, 3)}****${phoneMatches[0].slice(7)}]`);
  }

  // E. 正则检查：微信号/QQ号引流 (如: wx: abc1234, qq: 12345678)
  const contactRegex = /(?:wx|vx|wechat|微信|扣扣|qq|企鹅号)[\s:：_—\-]*([a-zA-Z0-9_\-]{5,20})/gi;
  const contactMatches = content.match(contactRegex);
  if (contactMatches && contactMatches.length > 0) {
    hitViolations.push(`联系方式引流 [${contactMatches[0]}]`);
  }

  // F. 检查网址链接引流 (http/https/t.cn)
  const urlRegex = /(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*/gi;
  const urlMatches = content.match(urlRegex);
  if (urlMatches && urlMatches.length > 0) {
    hitViolations.push(`外链网址 [${urlMatches[0]}]`);
  }

  const uniqueViolations = Array.from(new Set(hitViolations));

  if (uniqueViolations.length > 0) {
    let reason = '评价内容疑似包含不规范信息：';
    if (phoneMatches || contactMatches || urlMatches) {
      reason = '为保障校园信息安全与师生隐私，严禁在公开发言中泄露手机号、联系方式或外链。';
    } else {
      reason = '请使用客观、理性的语言描述课程与授课体验，严禁人身攻击、粗俗辱骂或广告刷屏。';
    }
    return {
      isClean: false,
      violations: uniqueViolations,
      reason,
    };
  }

  return {
    isClean: true,
    violations: [],
    reason: '',
  };
}
