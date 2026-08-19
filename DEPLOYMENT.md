# 疼痛门诊患者治疗系统部署说明

本系统包含患者治疗管理 Web 服务、MySQL 数据库及独立备份服务。推荐通过 Docker Compose 在医疗机构内网服务器或受管云主机部署。数据库原始数据、压缩备份文件均写入宿主机指定的数据目录，不依赖容器临时文件系统。

## 运行方式比较

| 方案 | 适用场景 | 数据存放与运维 | 成本与复杂度 |
| --- | --- | --- | --- |
| Docker Compose（推荐） | 医院内网、私有服务器、需要数据库与备份文件落本机系统盘 | 通过 `DATA_ROOT` 映射 MySQL 与备份目录，机构自行掌握数据 | 需要具备 Docker 运维能力；无额外平台运行费用 |
| 托管预览环境 | 设计评审、演示、短期试用 | 数据由托管数据库管理，不支持 Docker 卷映射 | 部署更轻量，但不适合作为医疗生产数据的唯一运行位置 |

> 对于含患者身份资料的真实生产环境，应结合本机构的网络隔离、访问审计、数据备份及个人信息保护制度，决定服务器位置、TLS 证书和账号管理策略。

## 首次部署

在目标服务器安装 Docker Engine 和 Docker Compose 后，将项目目录复制到服务器。复制环境文件并按机构安全标准填写高强度密码：

```bash
cp docker-env.template .env
```

Linux 下可将数据映射至系统盘目录，例如 `DATA_ROOT=/opt/pain-clinic-data`；Windows Docker Desktop 环境可设置为 `DATA_ROOT=D:/pain-clinic-data`。随后启动服务：

```bash
docker compose up -d --build
docker compose ps
```

默认通过 `http://服务器地址:8080` 访问系统。首次登录使用 `.env` 中的 `BOOTSTRAP_ADMIN_USERNAME` 和 `BOOTSTRAP_ADMIN_PASSWORD`。管理员应在登录后立即创建正式管理员、医生、前台账号，并妥善保存或停用初始化账号。

## 持久化目录与恢复

| 宿主机目录 | 容器位置 | 内容 |
| --- | --- | --- |
| `${DATA_ROOT}/mysql` | `/var/lib/mysql` | MySQL 数据库数据文件 |
| `${DATA_ROOT}/backups` | `/app/runtime/backups`、`/backups` | 自动生成的 `sql.gz` 备份与手动备份请求文件 |

备份服务启动后会立即创建首份备份，并根据 `BACKUP_INTERVAL_HOURS` 定期执行。保留期由 `BACKUP_RETENTION_DAYS` 控制；管理员也可以在“备份管理”中启停策略、修改频率及保留天数，或申请即时备份和下载已登记备份。

### 数据库恢复操作

恢复会覆盖当前业务数据库，必须由具备数据库运维权限的人员操作。先停止全部服务，并将现有 MySQL 数据目录完整复制到安全位置；再启动 MySQL 服务、从指定压缩备份导入、最后启动应用和备份服务。以下示例中的文件名应替换为实际备份文件名：

```bash
docker compose down
cp -a "${DATA_ROOT}/mysql" "${DATA_ROOT}/mysql-before-restore-$(date +%Y%m%d%H%M%S)"
docker compose up -d mysql
gzip -dc "${DATA_ROOT}/backups/pain-clinic_YYYYMMDDTHHMMSSZ.sql.gz" | \
  docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
docker compose up -d
docker compose ps
```

导入命令返回后，应由管理员登录系统抽查患者、排班和备份记录，再决定是否恢复正常业务访问。严禁将真实生产备份文件上传至公共代码仓库、即时通信群或未授权存储位置。

## Excel 使用

患者导出文件可以作为患者批量导入模板。导入时系统读取第一张工作表中的“姓名、性别、联系电话、身份证号、地址、总治疗次数、备注”列，并先显示可导入行数。治疗记录导出文件也可作为治疗记录导入模板；导入时按“患者编号、治疗项目编码、医生账号、排班时间”校验关联资料，并拒绝与现有排班完全相同的重复记录。

## GitHub 同步

当前公开代码仓库为 [gotyuo/zhiliao](https://github.com/gotyuo/zhiliao)。该项目的托管工作区保留了内部 `origin` 远程，因此同步到 GitHub 时使用独立的 `github` 远程，避免误改托管远程地址。首次关联或在新的工作副本中同步可执行：

```bash
git remote add github https://github.com/gotyuo/zhiliao.git
git push -u github main
```

后续将本地已提交的变更推送到公开仓库使用 `git push github main`；拉取远程变更前应先确认本地没有未提交内容，再执行 `git pull --ff-only github main`。若仓库 URL 已配置，可跳过 `git remote add` 步骤。

`.env`、宿主机 `data/` 目录、数据库密码与备份文件不得提交到 GitHub。部署前请确认 `.gitignore` 已覆盖这些私密资源。
