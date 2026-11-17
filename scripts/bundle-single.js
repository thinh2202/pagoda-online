import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve('dist')
const htmlPath = path.join(distDir, 'index.html')
const assetsDir = path.join(distDir, 'assets')

if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf8')
  const files = fs.readdirSync(assetsDir)
  const cssFile = files.find((f) => f.endsWith('.css'))
  const jsFile = files.find((f) => f.endsWith('.js'))

  if (cssFile) {
    const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8')
    html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${cssContent}\n</style>`)
  }

  if (jsFile) {
    const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8')
    html = html.replace(/<script type="module"[^>]*><\/script>/, () => `<script>\n${jsContent}\n</script>`)
  }

  fs.writeFileSync('chua-online.html', html, 'utf8')
  console.log('Successfully created chua-online.html!')
}

