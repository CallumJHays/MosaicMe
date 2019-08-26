from sanic import Sanic

app = Sanic()


@app.route('/')
@app.route('/<uri>')
async def gateway(req, path=''):
    return "Hello World"
