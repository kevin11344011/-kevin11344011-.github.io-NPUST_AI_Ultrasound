# GitHub Pages Annotation Tool V1

這一版是純前端 HTML / CSS / JavaScript，可直接放到 GitHub Pages。

## 功能
- 選擇本機影像資料夾
- 左側影像列表
- 切換圖片時自動儲存標記
- 滾輪縮放影像
- 左鍵自由塗抹，放開後自動閉合 polygon
- 半透明區塊顯示
- 自訂類別名稱與顏色
- 區塊上顯示類別名稱
- 本地暫存到 localStorage
- 匯出目前 YOLO txt
- 匯出全部 YOLO txt ZIP

## 使用方式
1. 開啟 index.html
2. 點選「選擇影像資料夾」
3. 左側點選影像
4. 在畫面上按住左鍵塗抹
5. 放開左鍵後完成一個標記區塊
6. 切換圖片時會自動儲存
7. 按「匯出目前 YOLO txt」或「匯出全部 YOLO txt」

## GitHub Pages 部署
把這些檔案推到 repo 後，於 GitHub:
- Settings
- Pages
- Deploy from branch
- 選 main / root

## 注意
- 影像不會上傳到伺服器
- 暫存存在瀏覽器本地 localStorage
- 清除瀏覽器資料可能會導致暫存消失
- 若換瀏覽器或換裝置，暫存不會同步
