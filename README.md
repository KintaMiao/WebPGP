# WebPGP

WebPGP是一个基于Web的PGP（Pretty Good Privacy）加密解决方案，使用OpenPGP.js库实现加密和解密功能，提供简单易用的网页界面。

## 功能特点

- 文本加密与解密
- 密钥生成与管理
- 文件加密与解密
- 数字签名验证
- 在浏览器中本地处理，无需服务器存储敏感数据

## 技术栈

- HTML/CSS/JavaScript
- [OpenPGP.js](https://openpgpjs.org/) - PGP加密库
- Bootstrap - UI界面框架

## 安装与使用

1. 克隆仓库
```
git clone https://github.com/yourusername/WebPGP.git
cd WebPGP
```

2. 使用HTTP服务器打开项目（如Python的http模块）
```
python -m http.server
```

3. 在浏览器中访问 `http://localhost:8000`

## 使用指南

### 生成密钥对
1. 在"密钥管理"标签下填写名称和邮箱
2. 设置密码保护私钥
3. 点击"生成密钥对"按钮
4. 保存生成的公钥和私钥

### 加密消息
1. 在"加密"标签下输入或粘贴要加密的文本
2. 添加接收者的公钥
3. 点击"加密"按钮
4. 复制生成的加密文本

### 解密消息
1. 在"解密"标签下粘贴加密的文本
2. 选择或输入您的私钥
3. 输入私钥密码
4. 点击"解密"按钮查看解密后的内容

## 安全注意事项

- 私钥应妥善保管，不要分享给他人
- 建议使用强密码保护私钥
- 所有加密和解密操作都在本地浏览器中完成，不会向服务器发送数据

## 许可证

本项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件
