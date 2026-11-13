# Design

Extend ToolsFileDecision as a closed union with {path:"AGENTS.md",source,action:"custom",content:string}. Freeze caller content into the action during public prepare. Keep custom_agents_content in the private guard so selection validation can reconstruct the intended final content during apply and original-operation recovery. The guard does not introduce a provider or approval token. Retain the prospective Core-rendered content for the template receipt. Existing candidate fingerprint and later-work comparisons remain unchanged.

Expose tools_custom_instruction:{path:"AGENTS.md",action:"custom"} in maintain contract. Guru consumes this before preparing custom content. No version or published package changes are part of this isolated candidate; dependency delivery requires a new fixed source commit and successful CI. No additional release identity or npm publication is required.
