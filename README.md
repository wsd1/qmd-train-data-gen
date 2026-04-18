# qmd-train-data-gen


QMD项目有finetune路径，可以优化训练内置的大模型以优化关键词嵌入和query扩展等相关能力。
本项目用于从本地文档来生成符合规范要求的训练数据。目前已经生成1000多条优化的中文数据。
注意放入my_docs 的文档在训练数据生成后会被删除，因此请拷贝进入。

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run 
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
