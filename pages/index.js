import React, { useState } from "react";
import Files from "react-files";
import Countdown from "react-countdown-now";
import Pica from "pica";
import { Progress } from "semantic-ui-react";

const pica = Pica();

let tryFallbackDevServer = false;
const API = resource =>
  `${tryFallbackDevServer ? "http://localhost:8000" : ""}/api/${resource}`;

const Home = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      textAlign: "center",
      fontFamily: "Arial !important"
    }}
  >
    <link
      rel="stylesheet"
      href="//cdn.jsdelivr.net/npm/semantic-ui@2.4.2/dist/semantic.min.css"
    />
    {((
      [tileFiles, setTileFiles] = useState([]),
      [mainFile, setMainFile] = useState(null),
      [mosaicPngURL, setMosaicPngURL] = useState(null),
      [loading, setLoading] = useState(false),
      percentCompressed = Math.round(
        (tileFiles.reduce(
          (done, file) => done + !file.hasOwnProperty("preview"),
          0
        ) /
          tileFiles.length) *
          100
      )
    ) => (
      <div>
        <pre style={{ fontSize: 12 }}>
          Bugs:
          <br />
          - drag-n-drop group photos is bugged most of time
          <br />
          - lambda invocation limit (api call file upload HTTP req is too FAT)
          <br />- lambda return size too large for higher-resolution target
          photos
        </pre>
        <h3>Step 1: Upload all the images you want to be in the mosaic</h3>
        {isNaN(percentCompressed) ? null : (
          <div>
            <Progress
              percent={percentCompressed}
              indicating={percentCompressed < 100}
              autoSuccess
              style={{ maxWidth: 400, margin: "0 auto", marginBottom: 30 }}
            >
              {percentCompressed < 100
                ? "Compressing tile images for Upload..."
                : "Ready for upload"}
            </Progress>
          </div>
        )}
        <Files
          style={{
            minHeight: 100,
            maxHeight: 200,
            maxWidth: 600,
            padding: 5,
            border: "2px dashed gray",
            overflowY: "scroll",
            cursor: "pointer",
            margin: "0 auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "gray",
            flexWrap: "wrap"
          }}
          onChange={async files => {
            for (const [idx, file] of files.entries()) {
              const MIN_DIM = 200;
              const buffer = document.createElement("canvas");

              const imgCached = await new Promise(resolve => {
                const res = new Image();
                res.src = URL.createObjectURL(file);
                res.onload = () => resolve(res);
              });

              const { width, height } = imgCached;

              if (width === MIN_DIM || height === MIN_DIM) {
                // this one is already G
                resolve(file);
              }

              if (width > height) {
                buffer.width = (width / height) * MIN_DIM;
                buffer.height = MIN_DIM;
              } else {
                buffer.width = MIN_DIM;
                buffer.height = (height / width) * MIN_DIM;
              }

              await pica.resize(imgCached, buffer, {
                unsharpAmount: 80,
                unsharpRadius: 0.6,
                unsharpThreshold: 2
              });

              const scaledDown = await pica.toBlob(buffer, "image/png");
              files[idx] = scaledDown;
              // set with any new files changed
              setTileFiles(
                files.map((f, idx2) => (idx2 === idx ? scaledDown : f))
              );
            }
          }}
          onError={(error, _file) =>
            alert(`Something went wrong. ${error.code}: ${error.message}`)
          }
          accepts={["image/*"]}
          multiple
          clickable
        >
          {tileFiles.length === 0
            ? "Choose / drop images HERE"
            : tileFiles.map((file, idx) => (
                <img
                  style={{
                    maxHeight: 50,
                    maxWidth: 50,
                    padding: 5,
                    filter: file.preview ? "grayscale(100%)" : "none"
                  }}
                  src={
                    file.preview ? file.preview.url : URL.createObjectURL(file)
                  }
                  key={idx}
                />
              ))}
        </Files>

        <h3>Step 2: Upload the photo to make the mosaic "look like"</h3>
        <Files
          style={{
            minHeight: 100,
            maxHeight: 200,
            maxWidth: 400,
            padding: 5,
            border: "2px dashed gray",
            overflowY: "scroll",
            cursor: "pointer",
            margin: "0 auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "gray"
          }}
          onChange={([only_file]) => setMainFile(only_file)}
          onError={(error, _file) =>
            alert(`Something went wrong. ${error.code}: ${error.message}`)
          }
          accepts={["image/*"]}
          clickable
        >
          {mainFile === null ? (
            "Choose / drop image HERE"
          ) : (
            <img
              style={{ maxHeight: 350, maxWidth: 350, padding: 5 }}
              src={mainFile.preview.url}
            />
          )}
        </Files>

        <h3>
          Step 3: Click submit and your mosaic photo will appear shortly (up to
          5 minutes)
        </h3>
        {loading ? (
          <>
            <p>Loading....</p>
            <Countdown date={Date.now() + 300000} />
          </>
        ) : (
          <button
            style={{
              border: "3px solid black",
              borderRadius: 5,
              padding: 20,
              fontSize: "1.25em",
              marginTop: 10,
              cursor: "pointer"
            }}
            onClick={async () => {
              setLoading(true);
              // encode the form files as formdata manually
              const formData = new FormData();
              formData.append("target", mainFile);
              tileFiles.forEach(file => formData.append(`tiles`, file));

              let res = await fetch(API("mosaic"), {
                method: "POST",
                body: formData
              });

              if (res.status !== 200) {
                if (tryFallbackDevServer) {
                  // if we've alread tried the fallback devserver, must just be broken
                  throw new Error(res);
                }
                tryFallbackDevServer = true;

                res = await fetch(API("mosaic"), {
                  method: "POST",
                  body: formData
                });
              }
              const png_bytes = await res.blob();
              // store this as blob(file) object in browser cache
              setMosaicPngURL(URL.createObjectURL(png_bytes));
              setLoading(false);
            }}
          >
            Make Mosaic
          </button>
        )}

        <br />

        {mosaicPngURL ? (
          <img
            src={mosaicPngURL}
            style={{ maxWidth: 400, maxHeight: 400, margin: 20 }}
          />
        ) : null}
      </div>
    ))()}
  </div>
);

export default Home;
