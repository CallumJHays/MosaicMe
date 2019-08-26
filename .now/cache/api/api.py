from sanic import Sanic, response

app = Sanic()


@app.route('/')
@app.route('/<uri>')
async def gateway(req, uri=''):
    return response.text('Hello World')


if __name__ == "__main__":
    app.run()
