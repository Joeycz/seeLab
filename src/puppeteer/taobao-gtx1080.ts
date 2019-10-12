// 引入一些需要用到的库以及一些声明
import * as puppeteer from 'puppeteer' // 引入Puppeteer
import mongo from '../../lib/mongoDb' // 需要用到的 mongodb库，用来存取爬取的数据
import chalk from 'chalk' // 一个美化 console 输出的库

const log = console.log // 缩写 console.log
const TOTAL_PAGE = 2 // 定义需要爬取的网页数量，对应页面下部的跳转链接

// 定义要爬去的数据结构
interface IWriteData { 
  link: string // 爬取到的商品详情链接
  picture: string // 爬取到的图片链接
  price: number // 价格，number类型，需要从爬取下来的数据进行转型
  title: string // 爬取到的商品标题
}

// 格式化的进度输出 用来显示当前爬取的进度
function formatProgress (current: number): string { 
  let percent = (current / TOTAL_PAGE) * 100
  let done = ~~(current / TOTAL_PAGE * 40)
  let left = 40 - done
  let str = `当前进度：[${''.padStart(done, '=')}${''.padStart(left, '-')}]   ${percent}%`
  return str
}

// 因为我们需要用到大量的 await 语句，因此在外层包裹一个 async function
async function main() {
	// 首先通过Puppeteer启动一个浏览器环境
  const browser = await puppeteer.launch({
		headless: false,
		// defaultViewport: {
		// 	width: 960,
		// 	height: 960,
		// 	isMobile: true
		// },
		ignoreDefaultArgs: ['--enable-automation'] // 去掉window.navigator.webdriver标记
	})
	log(chalk.green('服务正常启动'))
	// 使用 try catch 捕获异步中的错误进行统一的错误处理
  try {
		// 打开一个新的页面
		const page = await browser.newPage()
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36 Edge/16.16299')
		// 监听页面内部的console消息
    page.on('console', msg => {
      if (typeof msg === 'object') {
        console.dir(msg)
      } else {
        log(chalk.blue(msg))
      }
		})
		
		// 打开我们刚刚看见的淘宝页面
		await page.goto('https://s.taobao.com/search?q=gtx1080', {
			waitUntil: 'networkidle2'
		})
		
		// 自动登录淘宝
		const loginSwitch = await page.$('#J_Quick2Static')
		const usernameInput = await page.$('#TPL_username_1')
		const passwordInput = await page.$('#TPL_password_1')
		const loginSubmit = await page.$('#J_SubmitStatic')
		
		await loginSwitch.click()

		await usernameInput.type('用户名')
		await passwordInput.type('密码')

		await loginSubmit.click()
		await page.waitForNavigation()
		
		log(chalk.yellow('页面初次加载完毕'))

		await page.waitFor(2500)

		await page.screenshot({
			path: 'assets/images/gtx1080.png',
			fullPage: true
		})
		
		// 使用一个 for await 循环，不能一个时间打开多个网络请求，这样容易因为内存过大而挂掉
    for (let i = 1; i <= TOTAL_PAGE; i++) {
			// 找到分页的输入框以及跳转按钮
			const pageInput = await page.$(`.J_Input[type='number']`)
			const submit = await page.$('.J_Submit')
			// 模拟输入要跳转的页数
			await pageInput.type('' + i)
			// 模拟点击跳转
			await submit.click()
			// 等待页面加载完毕，这里设置的是固定的时间间隔，之前使用过page.waitForNavigation()，但是因为等待的时间过久导致报错（Puppeteer默认的请求超时是30s,可以修改）,因为这个页面总有一些不需要的资源要加载，而我的网络最近日了狗，会导致超时，因此我设定等待2.5s就够了
			await page.waitFor(2500)
			
			// 清除当前的控制台信息
			console.clear()
			// 打印当前的爬取进度
      log(chalk.yellow(formatProgress(i)))
			log(chalk.yellow('页面数据加载完毕'))
			
			// 处理数据，这个函数的实现在下面
      await handleData()
      // 一个页面爬取完毕以后稍微歇歇，不然太快淘宝会把你当成机器人弹出验证码（虽然我们本来就是机器人）
      await page.waitFor(2500)
		}

		// 所有的数据爬取完毕后关闭浏览器
    await browser.close()
		log(chalk.green('服务正常结束'))
		
		// 这是一个在内部声明的函数，之所以在内部声明而不是外部，是因为在内部可以获取相关的上下文信息，如果在外部声明我还要传入 page 这个对象
		async function handleData() {
			// 现在我们进入浏览器内部搞些事情，通过page.evaluate方法，该方法的参数是一个函数，这个函数将会在页面内部运行，
			// 这个函数的返回的数据将会以Promise的形式返回到外部 
      const list = await page.evaluate(() => {
				// 先声明一个用于存储爬取数据的数组
				const writeDataList: IWriteData[] = []
				// 获取到所有的商品元素
				let itemList = document.querySelectorAll('.item.J_MouserOnverReq')
				// 遍历每一个元素，整理需要爬取的数据
        for (let item of itemList) {
					// 首先声明一个爬取的数据结构
          let writeData: IWriteData = {
            picture: undefined,
            link: undefined,
            title: undefined,
            price: undefined
					}
					
					// 找到商品图片的地址
          let img = item.querySelector('img')
					writeData.picture = img.src
					
					// 找到商品的链接
          let link: HTMLAnchorElement = item.querySelector('.pic-link.J_ClickStat.J_ItemPicA')
					writeData.link = link.href
					
					// 找到商品的价格，默认是string类型 通过~~转换为整数number类型
          let price = item.querySelector('strong')
					writeData.price = ~~price.innerText
					
					// 找到商品的标题，淘宝的商品标题有高亮效果，里面有很多的span标签，不过一样可以通过innerText获取文本信息
					let title: HTMLAnchorElement = item.querySelector('.title>a')
					writeData.title = title.innerText

					// 将这个标签页的数据push进刚才声明的结果数组
          writeDataList.push(writeData)
				}

				// 当前页面所有的返回给外部环境
        return writeDataList
			})

			// 得到数据以后写入到mongodb
			const result = await mongo.insertMany('GTX1080', list)
			
			log(chalk.yellow('写入数据库完毕'))
		}
	} catch (error) {
		// 出现任何错误，打印错误消息并且关闭浏览器
    console.log(error)
    log(chalk.red('服务意外终止'))
    await browser.close()
	} finally {
    // 最后要退出进程
    process.exit(0)
  }
}

main()