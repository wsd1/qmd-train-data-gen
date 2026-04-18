import { readdir, readFile, appendFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
const URL = 'http://localhost:1234/v1';//'https://api.deepseek.com'
const KEY = 'lm-studio'; //process.env.DEEPSEEK_API_KEY
const MODEL ="qwen/qwen3-coder-next"; //"deepseek-chat"
// 初始化 DeepSeek 客户端
const openai = new OpenAI({
  baseURL: URL,
  apiKey: KEY,
});

const INPUT_DIR = "./my_docs"; // 存放你 MD 文档的目录
const OUTPUT_FILE = "qmd_train_data.jsonl";

/**
 * 语义切分：按 Markdown 标题切分，确保上下文完整
 */
function splitMarkdown(text: string): string[] {
  // 匹配行首的 ## 或 ### 进行切分
  return text
    .split(/(?=^##+ )/m)
    .map(s => s.trim())
    .filter(s => s.length > 100 && s.length <= 2000); // 过滤掉太短或太长的内容
}

/**
 * 调用 DeepSeek API 生成结构化数据
 */
async function generateQMDData(chunk: string, source: string) {
  const systemPrompt = `你是一个搜索引擎优化和 RAG 数据专家。
请将输入的 Markdown 知识片段转换为 QMD 检索管道的微调训练数据格式。
你必须返回一个合法的 JSON 对象，不要包含任何 Markdown 格式代码块外壳。`;

  const userPrompt = `
知识片段（来源 ${source}）:
"""
${chunk}
"""

任务：根据上述内容生成以下字段：
1. "query": 用户搜索该内容时最可能输入的简短关键词（2-5字）。
2. "output": 一个数组，包含：
   - ["lex", "..."]：3条，提取核心术语和同义词用于关键词匹配。
   - ["vec", "..."]：2条，自然语言提问用于向量匹配。
   - ["hyde", "..."]：1条，根据内容生成一段 50-100 字的假设性理想回答。
3. "category": 自动判断内容所属领域。
4. "is_short": 固定为 false。
5. "intent": 简洁描述用户的搜索意图（如 "查询安装步骤", "了解核心原理")。

请严格按 JSON 格式返回。`;

  try {

    let req = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      // DeepSeek 支持 json_object 模式，确保输出稳定
      //response_format: { type: 'json_object' }
      //temperature: 0.3
      stream: false
    };
    if(URL == 'http://localhost:1234/v1'){
      req.temperature = 0.3;
    }
    else{
      req.response_format = { type: 'json_object' };
    }

    const response = await openai.chat.completions.create(req);



    const content = response.choices[0].message.content || "{}";

    // 安全提取 JSON（处理可能包含的 Markdown 代码块或额外文本）
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                     content.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;

    return JSON.parse(jsonString);

  } catch (error) {
    console.error("生成失败:", error);
    console.error("原始响应:", response?.choices[0].message.content);
    return {}; // 返回默认值避免崩溃
  }

}

/**
 * 记录错误并重命名失败文件
 */
async function handleFailedFile(fileName: string, error: unknown) {
  const errorMsg = `[${new Date().toISOString()}] 处理文件 ${fileName} 时出错: ${error}`;
  console.error(errorMsg);

  // 重命名原文件，添加 failed- 前缀（在原目录）
  const newFileName = `failed-${fileName}`;
  await rename(
    path.join(INPUT_DIR, fileName),
    path.join(INPUT_DIR, newFileName)
  );
  console.log(`   📁 文件已重命名为: ${newFileName}`);
}

async function main() {
  try {
    const files = (await readdir(INPUT_DIR)).filter(f => f.endsWith(".md"));
    
    console.log(`开始处理 ${files.length} 个文件...`);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        const content = await readFile(path.join(INPUT_DIR, file), "utf-8");
        const chunks = splitMarkdown(content);
        
        console.log(`\n[${i + 1}/${files.length}] 正在处理文件: ${file} (分成了 ${chunks.length} 块)`);

        let processedCount = 0;
        for (let j = 0; j < chunks.length; j++) {
          try {
            const res = await generateQMDData(chunks[j], file);
            // 跳过空对象
            if (Object.keys(res).length === 0) {
              console.log(`  ⚠️ [块 ${j + 1}/${chunks.length}] 跳过空结果`);
              continue;
            }
            const jsonLine = JSON.stringify(res, null, 0);
            await appendFile(OUTPUT_FILE, jsonLine + "\n");
            console.log(`  ✅ [块 ${j + 1}/${chunks.length}] 成功`);
            successCount++;
            processedCount++;
          } catch (e: any) {
            console.error(`  ❌ [块 ${j + 1}/${chunks.length}] 处理失败:`, e.message);
            processedCount++; // 无论成功还是失败都算处理过
          }
        }

        // 所有块处理完成后，删除源文件
        if (processedCount > 0) {
          await unlink(path.join(INPUT_DIR, file));
          console.log(`   🗑️  文件已删除 (处理了 ${processedCount} 块)`);
        }

      } catch (err: any) {
        failCount++;
        await handleFailedFile(file, err);
      }
    }

    console.log(`\n🎉 处理完成！`);
    console.log(`成功处理块数: ${successCount}`);
    console.log(`失败文件数: ${failCount}`);
    console.log(`数据已追加保存到: ${OUTPUT_FILE}`);

  } catch (err) {
    console.error("运行出错:", err);
  }
}

main();
