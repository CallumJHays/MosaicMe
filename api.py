from sanic import Sanic, Blueprint, response
from sanic_cors import CORS
from fs.memoryfs import MemoryFS
from io import BytesIO

from mosaic import mosaic as make_mosaic


api = Blueprint('api', url_prefix='/api')


@api.post('/mosaic')
async def mosaic(req):
    with MemoryFS() as fs:
        [target, ] = req.files['target']
        fs.upload('target', BytesIO(target.body))

        fs.makedir('tiles')
        for tile in req.files['tiles']:
            fs.upload(f'tiles/{tile.name}', BytesIO(tile.body))

        image = make_mosaic(fs, 'target', 'tiles').image

    buffer = BytesIO()
    image.save(buffer, 'png')
    buffer.seek(0)
    return response.raw(buffer.read())


app = Sanic()
app.blueprint(api)


if __name__ == "__main__":
    CORS(app)
    app.run()
