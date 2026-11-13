# Custom tools instruction content

Guru #658 needs to submit final AGENTS.md content before public tools preparation. Existing replace, preserve, create-new and remove behavior stays unchanged. Only AGENTS.md supports custom content. Preparation is target-write-free. Apply, original-operation recover/resume and rollback must use the same final bytes and preserve permissions. Later project edits must still block replay and rollback. Core template receipts must describe the Core candidate rather than caller content.

## Acceptance scenarios

1. Prepare custom AGENTS content, apply, recover and resume using the original operation; preserve project sections and mode.
2. Reapply custom content as a separate operation. First roll back the reapply operation, then roll back the original operation to exact original bytes/mode.
3. Edit AGENTS after apply through normal filesystem work; recover/resume/rollback reject later work.
4. Existing actions keep their behavior; custom for other assets is rejected before writes.
5. Core template receipt remains equal to an ordinary replacement candidate receipt.
