## 使用示例

参照 `__tests__/run.test.ts`

> **重要、重要、重要**: 本地测试时需要将 src/index 重的 internal 设置成 false，否则网络不通导致测试失败

## 发布包

需要先按照[包版本语义化](https://semver.org/lang/zh-CN/)中的约定去更新 `package.json`文件的`version`字段，然后创建一个 release，创建的 tag 需要以 `release/` 开头
