import sys
from PIL import Image
from fs import path, tempfs

# Change these 3 config parameters to suit your needs...
TILE_SIZE = 50		# height/width of mosaic tiles in pixels
# tile matching resolution (higher values give better fit but require more processing)
TILE_MATCH_RES = 5
ENLARGEMENT = 8		# the mosaic image will be this many times wider and taller than the original

TILE_BLOCK_SIZE = TILE_SIZE // max(min(TILE_MATCH_RES, TILE_SIZE), 1)
OUT_FILE = 'mosaic.jpeg'
EOQ_VALUE = None


class TileProcessor:
    def __init__(self, fs, tiles_directory):
        self.fs = fs
        self.tiles_directory = tiles_directory

    def __process_tile(self, tile_path):
        try:
            img = Image.open(self.fs.open(tile_path, 'rb'))
            # tiles must be square, so get the largest square that fits inside the image
            w = img.size[0]
            h = img.size[1]
            min_dimension = min(w, h)
            w_crop = (w - min_dimension) / 2
            h_crop = (h - min_dimension) / 2
            img = img.crop((w_crop, h_crop, w - w_crop, h - h_crop))

            large_tile_img = img.resize(
                (TILE_SIZE, TILE_SIZE),
                Image.ANTIALIAS
            )
            small_tile_img = img.resize(
                (
                    TILE_SIZE // TILE_BLOCK_SIZE,
                    TILE_SIZE // TILE_BLOCK_SIZE
                ),
                Image.ANTIALIAS
            )

            return (large_tile_img.convert('RGB'), small_tile_img.convert('RGB'))
        except IOError:
            return (None, None)

    def get_tiles(self):
        large_tiles = []
        small_tiles = []

        print(f"Reading tiles from {self.tiles_directory}")

        # search the tiles directory recursively
        for root, _, files in self.fs.walk(self.tiles_directory):
            for tile_name in (f.name for f in files):
                tile_path = path.join(root, tile_name)
                large_tile, small_tile = self.__process_tile(tile_path)
                if large_tile:
                    large_tiles.append(large_tile)
                    small_tiles.append(small_tile)

        print(f"Processed {len(large_tiles)} tiles.")

        return (large_tiles, small_tiles)


class TargetImage:
    def __init__(self, fs, image_path):
        self.fs = fs
        self.image_path = image_path

    def get_data(self):
        print("Processing main image")
        img = Image.open(self.fs.open(self.image_path, 'rb'))
        w = img.size[0] * ENLARGEMENT
        h = img.size[1] * ENLARGEMENT
        large_img = img.resize((w, h), Image.ANTIALIAS)
        w_diff = (w % TILE_SIZE) // 2
        h_diff = (h % TILE_SIZE) // 2

        # if necesary, crop the image slightly so we use a whole number of tiles horizontally and vertically
        if w_diff or h_diff:
            large_img = large_img.crop(
                (w_diff, h_diff, w - w_diff, h - h_diff)
            )

        small_img = large_img.resize(
            (w // TILE_BLOCK_SIZE, h // TILE_BLOCK_SIZE),
            Image.ANTIALIAS
        )

        image_data = (large_img.convert('RGB'), small_img.convert('RGB'))

        print("Main image processed.")

        return image_data


class TileFitter:
    def __init__(self, tiles_data):
        self.tiles_data = tiles_data

    def __get_tile_diff(self, t1, t2, bail_out_value):
        diff = 0
        for i in range(len(t1)):
            diff += (
                (t1[i][0] - t2[i][0]) ** 2
                + (t1[i][1] - t2[i][1]) ** 2
                + (t1[i][2] - t2[i][2]) ** 2
            )
            if diff > bail_out_value:
                # we know already that this isnt going to be the best fit, so no point continuing with this tile
                return diff
        return diff

    def get_best_fit_tile(self, img_data):
        best_fit_tile_index = None
        min_diff = float('inf')
        tile_index = 0

        # go through each tile in turn looking for the best match for the part of the image represented by 'img_data'
        for tile_data in self.tiles_data:
            diff = self.__get_tile_diff(img_data, tile_data, min_diff)
            if diff < min_diff:
                min_diff = diff
                best_fit_tile_index = tile_index
            tile_index += 1

        return best_fit_tile_index


class ProgressCounter:
    def __init__(self, total):
        self.total = total
        self.counter = 0

    def update(self):
        self.counter += 1
        sys.stdout.write("Progress: %s%% %s" %
                         (100 * self.counter / self.total, "\r"))
    sys.stdout.flush()


class MosaicImage:
    def __init__(self, original_img):
        self.image = Image.new(original_img.mode, original_img.size)
        self.x_tile_count = original_img.size[0] // TILE_SIZE
        self.y_tile_count = original_img.size[1] // TILE_SIZE
        self.total_tiles = self.x_tile_count * self.y_tile_count

    def add_tile(self, tile_data, coords):
        img = Image.new('RGB', (TILE_SIZE, TILE_SIZE))
        img.putdata(tile_data)
        self.image.paste(img, coords)

    def save(self, fs, path):
        self.image.save(fs.open(path, 'wb'))


def compose(original_img, tiles):
    original_img_large, original_img_small = original_img
    tiles_large, tiles_small = tiles

    mosaic = MosaicImage(original_img_large)

    all_tile_data_large = [tile.getdata() for tile in tiles_large]
    all_tile_data_small = [tile.getdata() for tile in tiles_small]
    tile_fitter = TileFitter(all_tile_data_small)

    for x in range(mosaic.x_tile_count):
        for y in range(mosaic.y_tile_count):
            large_box = (
                x * TILE_SIZE,
                y * TILE_SIZE,
                (x + 1) * TILE_SIZE,
                (y + 1) * TILE_SIZE
            )
            small_box = (
                x * TILE_SIZE // TILE_BLOCK_SIZE,
                y * TILE_SIZE // TILE_BLOCK_SIZE,
                (x + 1) * TILE_SIZE // TILE_BLOCK_SIZE,
                (y + 1) * TILE_SIZE // TILE_BLOCK_SIZE
            )
            img_data = list(
                original_img_small
                .crop(small_box)
                .getdata()
            )
            winner_idx = tile_fitter.get_best_fit_tile(img_data)
            mosaic.add_tile(all_tile_data_large[winner_idx], large_box)

    return mosaic


def mosaic(fs, img_path, tiles_path):
    tiles_data = TileProcessor(fs, tiles_path).get_tiles()
    image_data = TargetImage(fs, img_path).get_data()
    return compose(image_data, tiles_data)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <image> <tiles directory>")
    else:
        mosaic(tempfs.TempFS(), sys.argv[1], sys.argv[2])
