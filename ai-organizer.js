// AI书签整理模块 - 基于SiliconFlow API
// 说明：利用大语言模型分析书签内容，提供智能分类建议
console.log('[BookmarkTidy] 开始加载 ai-organizer.js');

/**
 * AI整理器配置
 */
const AI_CONFIG = {
  // SiliconFlow API配置
  apiKey: '', // 需要用户在设置中配置
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Qwen/Qwen2.5-72B-Instruct', // 使用通义千问模型
  
  // 分析配置
  maxBookmarksPerBatch: 20, // 每批次分析的书签数量
  timeout: 30000, // 请求超时时间
  
  // 分类策略
  categories: {
    '技术开发': ['编程', '开发工具', '技术文档', '代码仓库', 'API文档'],
    '学习资源': ['教程', '课程', '文档', '学习平台', '知识库'],
    '工具软件': ['在线工具', '效率工具', '设计工具', '办公软件'],
    '新闻资讯': ['新闻', '博客', '资讯', '媒体', '论坛'],
    '娱乐休闲': ['视频', '音乐', '游戏', '社交', '娱乐'],
    '购物消费': ['电商', '购物', '优惠', '比价', '支付'],
    '生活服务': ['地图', '天气', '交通', '美食', '旅游'],
    '金融理财': ['银行', '投资', '理财', '保险', '财经'],
    '其他': ['未分类', '临时', '待整理']
  }
};

/**
 * AI书签分析器类
 */
class AIBookmarkAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.initClient();
  }

  /**
   * 初始化API客户端
   */
  initClient() {
    if (!this.apiKey) {
      console.warn('[AI整理器] API Key未配置');
      return;
    }
    // 注意：在浏览器扩展中，我们需要使用fetch而不是OpenAI SDK
    this.client = {
      baseUrl: AI_CONFIG.baseUrl,
      apiKey: this.apiKey,
      model: AI_CONFIG.model
    };
  }

  /**
   * 调用SiliconFlow API进行书签分析
   * @param {Array} bookmarks - 书签列表
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeBookmarks(bookmarks) {
    if (!this.client || !this.apiKey) {
      throw new Error('AI服务未配置，请先在设置中配置API Key');
    }

    try {
      // 构建分析提示词
      const prompt = this.buildAnalysisPrompt(bookmarks);
      
      // 调用API
      const response = await this.callAPI(prompt);
      
      // 解析结果
      return this.parseAnalysisResult(response, bookmarks);
    } catch (error) {
      console.error('[AI整理器] 分析失败:', error);
      throw new Error(`AI分析失败: ${error.message}`);
    }
  }

  /**
   * 构建分析提示词
   * @param {Array} bookmarks - 书签列表
   * @returns {string} 提示词
   */
  buildAnalysisPrompt(bookmarks) {
    const categories = Object.keys(AI_CONFIG.categories).join('、');
    const bookmarkList = bookmarks.map((bookmark, index) => 
      `${index + 1}. 标题: "${bookmark.title}" URL: "${bookmark.url}"`
    ).join('\n');

    return `你是一个专业的书签整理助手。请分析以下书签，并为每个书签推荐最合适的分类。

可选分类：${categories}

书签列表：
${bookmarkList}

请按以下JSON格式返回分析结果：
{
  "analysis": [
    {
      "index": 1,
      "title": "书签标题",
      "category": "推荐分类",
      "confidence": 0.95,
      "reason": "分类理由"
    }
  ],
  "summary": {
    "total": ${bookmarks.length},
    "categories_used": ["使用的分类列表"],
    "suggestions": "整体建议"
  }
}

注意：
1. 请仔细分析书签的标题和URL内容
2. confidence表示分类的置信度(0-1)
3. 如果无法确定分类，请使用"其他"
4. 请确保返回有效的JSON格式`;
  }

  /**
   * 调用SiliconFlow API
   * @param {string} prompt - 提示词
   * @returns {Promise<string>} API响应
   */
  async callAPI(prompt) {
    const requestBody = {
      model: this.client.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // 降低随机性，提高一致性
      max_tokens: 2000
    };

    // 创建一个超时Promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API请求超时')), AI_CONFIG.timeout || 30000);
    });

    // API调用Promise
    const fetchPromise = fetch(`${this.client.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.client.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    // 使用Promise.race来处理超时
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API返回格式异常');
    }

    return data.choices[0].message.content;
  }

  /**
   * 解析AI分析结果
   * @param {string} response - API响应内容
   * @param {Array} originalBookmarks - 原始书签列表
   * @returns {Object} 解析后的结果
   */
  parseAnalysisResult(response, originalBookmarks) {
    try {
      // 尝试提取JSON内容
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('响应中未找到有效的JSON格式');
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // 验证结果格式
      if (!result.analysis || !Array.isArray(result.analysis)) {
        throw new Error('分析结果格式不正确');
      }

      // 补充缺失的书签（防止AI遗漏）
      const analyzedIndices = new Set(result.analysis.map(item => item.index));
      for (let i = 0; i < originalBookmarks.length; i++) {
        if (!analyzedIndices.has(i + 1)) {
          result.analysis.push({
            index: i + 1,
            title: originalBookmarks[i].title,
            category: '其他',
            confidence: 0.5,
            reason: 'AI分析遗漏，自动归类'
          });
        }
      }

      // 按索引排序
      result.analysis.sort((a, b) => a.index - b.index);

      return result;
    } catch (error) {
      console.error('[AI整理器] 结果解析失败:', error);
      // 返回默认分类结果
      return this.createFallbackResult(originalBookmarks);
    }
  }

  /**\n   * 创建备用分类结果（当AI分析失败时）\n   * @param {Array} bookmarks - 书签列表\n   * @returns {Object} 备用结果\n   */
  createFallbackResult(bookmarks) {
    return {
      analysis: bookmarks.map((bookmark, index) => ({
        index: index + 1,
        title: bookmark.title,
        category: '其他',
        confidence: 0.3,
        reason: 'AI分析失败，使用默认分类'
      })),
      summary: {
        total: bookmarks.length,
        categories_used: ['其他'],
        suggestions: 'AI分析失败，建议检查网络连接和API配置'
      }
    };
  }
}

/**
 * AI智能整理主函数
 * @param {string} folderId - 目标文件夹ID
 * @param {Object} options - 整理选项
 * @returns {Promise<Object>} 整理结果
 */
async function aiSmartOrganize(folderId, options = {}) {
  const { 
    apiKey, 
    cleanEmptyFolders = false, 
    batchSize = AI_CONFIG.maxBookmarksPerBatch,
    dryRun = false // 是否仅预览不执行
  } = options;

  if (!folderId) {
    throw new Error('文件夹ID不能为空');
  }

  if (!apiKey) {
    throw new Error('请先在设置中配置SiliconFlow API Key');
  }

  try {
    // 获取书签列表
    const children = await chrome.bookmarks.getChildren(folderId);
    const bookmarks = children.filter(item => item.url); // 只处理书签，不处理文件夹

    if (bookmarks.length === 0) {
      return { moved: 0, createdFolders: 0, cleanedFolders: 0, message: '没有找到需要整理的书签' };
    }

    // 初始化AI分析器
    const analyzer = new AIBookmarkAnalyzer(apiKey);
    
    // 分批处理书签（避免单次请求过大）
    const results = [];
    const totalBatches = Math.ceil(bookmarks.length / batchSize);
    
    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize);
      const currentBatch = Math.floor(i/batchSize) + 1;
      
      console.log(`[AI整理器] 正在分析第 ${currentBatch}/${totalBatches} 批书签 (${batch.length}个)`);
      
      try {
        const batchResult = await analyzer.analyzeBookmarks(batch);
        results.push(...batchResult.analysis);
        
        // 记录处理进度
        const progress = Math.round((currentBatch / totalBatches) * 100);
        console.log(`[AI整理器] 批次 ${currentBatch} 完成，总体进度: ${progress}%`);
        
      } catch (error) {
        console.error(`[AI整理器] 第 ${currentBatch} 批处理失败:`, error);
        // 对于失败的批次，创建默认分类
        const fallbackResults = batch.map((bookmark, idx) => ({
          index: i + idx + 1,  // 使用正确的索引
          title: bookmark.title,
          category: '其他',
          confidence: 0.1,
          reason: '分析失败，使用默认分类'
        }));
        results.push(...fallbackResults);
      }
      
      // 添加延迟避免API限流
      if (i + batchSize < bookmarks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 如果是预览模式，直接返回分析结果
    if (dryRun) {
      // 按分类组织书签
      const categories = {};
      results.forEach((result, index) => {
        const category = result.category || '其他';
        if (!categories[category]) {
          categories[category] = [];
        }
        // 在dryRun模式下，查找书签的优先级：
        // 1. 通过index字段查找（正常分析结果）
        // 2. 通过title字段查找
        // 3. 通过数组索引查找
        // 4. 如果都找不到，跳过这个结果
        let bookmark = null;
        if (typeof result.index === 'number' && result.index > 0) {
          // index是从1开始的，所以需要减1
          bookmark = bookmarks[result.index - 1];
        }
        
        if (!bookmark) {
          bookmark = bookmarks.find(b => b.title === result.title);
        }
        
        if (!bookmark) {
          bookmark = bookmarks[index];
        }
        
        if (bookmark) {
          categories[category].push({
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            confidence: result.confidence || 0.5,
            reason: result.reason || ''
          });
        }
      });
      
      return {
        preview: true,
        categories: categories,
        analysis: results,
        bookmarks: bookmarks,
        totalBookmarks: bookmarks.length,
        totalCategories: Object.keys(categories).length,
        message: `AI分析完成，共分析 ${results.length} 个书签，建议创建 ${Object.keys(categories).length} 个分类`
      };
    }

    // 执行整理
    return await executeAIOrganization(folderId, bookmarks, results, { cleanEmptyFolders });

  } catch (error) {
    console.error('[AI整理器] 整理失败:', error);
    throw error;
  }
}

/**
 * 执行AI整理结果
 * @param {string} folderId - 父文件夹ID
 * @param {Array} bookmarks - 原始书签列表
 * @param {Array} analysisResults - AI分析结果
 * @param {Object} options - 执行选项
 * @returns {Promise<Object>} 执行结果
 */
async function executeAIOrganization(folderId, bookmarks, analysisResults, options = {}) {
  const { cleanEmptyFolders = false } = options;
  
  // 创建文件夹缓存
  const folderCache = new Map();
  const createdFoldersSet = new Set();
  
  // 获取现有子文件夹
  const siblings = await chrome.bookmarks.getChildren(folderId);
  for (const sibling of siblings) {
    if (!sibling.url) {
      folderCache.set(sibling.title, sibling.id);
    }
  }

  // 确保分类文件夹存在
  const ensureFolder = async (categoryName) => {
    if (folderCache.has(categoryName)) {
      return folderCache.get(categoryName);
    }
    
    const created = await chrome.bookmarks.create({
      parentId: folderId,
      title: categoryName
    });
    
    folderCache.set(categoryName, created.id);
    createdFoldersSet.add(created.id);
    return created.id;
  };

  // 生成移动计划
  const movePlans = [];
  const categoryStats = new Map();
  
  for (let i = 0; i < analysisResults.length; i++) {
    const analysis = analysisResults[i];
    const bookmark = bookmarks[i];
    
    if (!bookmark || !analysis) continue;
    
    const categoryName = analysis.category || '其他';
    const targetFolderId = await ensureFolder(categoryName);
    
    // 只有当书签不在目标文件夹时才移动
    if (bookmark.parentId !== targetFolderId) {
      movePlans.push({
        id: bookmark.id,
        from: bookmark.parentId,
        to: targetFolderId,
        index: 0,
        category: categoryName,
        confidence: analysis.confidence || 0.5
      });
    }
    
    // 统计分类
    categoryStats.set(categoryName, (categoryStats.get(categoryName) || 0) + 1);
  }

  // 执行移动
  let moved = 0;
  for (const plan of movePlans) {
    try {
      await chrome.bookmarks.move(plan.id, {
        parentId: plan.to,
        index: plan.index
      });
      moved++;
    } catch (error) {
      console.error(`[AI整理器] 移动书签失败:`, error);
    }
  }

  // 清理空文件夹（可选）
  let cleanedFolders = 0;
  const cleanedFolderInfos = [];
  
  if (cleanEmptyFolders) {
    const afterChildren = await chrome.bookmarks.getChildren(folderId);
    for (const child of afterChildren) {
      if (child.url || createdFoldersSet.has(child.id)) continue;
      
      const subChildren = await chrome.bookmarks.getChildren(child.id);
      if (!subChildren || subChildren.length === 0) {
        cleanedFolderInfos.push({
          id: child.id,
          title: child.title,
          parentId: child.parentId,
          index: child.index ?? 0
        });
        
        await chrome.bookmarks.removeTree(child.id);
        cleanedFolders++;
      }
    }
  }

  // 记录撤销信息
  if (moved > 0 || createdFoldersSet.size > 0 || cleanedFolders > 0) {
    lastAction = {
      type: 'AI_ORGANIZE',
      data: movePlans.map(p => ({
        id: p.id,
        originalParentId: p.from,
        originalIndex: 0
      })),
      createdFolderIds: Array.from(createdFoldersSet),
      cleanedEmptyFolders: cleanedFolderInfos,
      aiAnalysis: analysisResults // 保存AI分析结果用于调试
    };
  }

  return {
    moved,
    createdFolders: createdFoldersSet.size,
    cleanedFolders,
    categoryStats: Object.fromEntries(categoryStats),
    message: `AI智能整理完成：移动 ${moved} 个书签，创建 ${createdFoldersSet.size} 个分类文件夹`
  };
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    aiSmartOrganize,
    AIBookmarkAnalyzer,
    AI_CONFIG
  };
}

// 在浏览器环境中添加到全局作用域
if (typeof window !== 'undefined') {
  window.aiSmartOrganize = aiSmartOrganize;
  window.AIBookmarkAnalyzer = AIBookmarkAnalyzer;
  window.AI_CONFIG = AI_CONFIG;
}

// 在Service Worker环境中添加到全局作用域
if (typeof self !== 'undefined') {
  self.aiSmartOrganize = aiSmartOrganize;
  self.AIBookmarkAnalyzer = AIBookmarkAnalyzer;
  self.AI_CONFIG = AI_CONFIG;
}

console.log('[BookmarkTidy] ai-organizer.js 加载完成，aiSmartOrganize函数:', typeof aiSmartOrganize);