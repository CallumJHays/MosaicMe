import React, { useState } from "react";
import Files from "react-files";
import Countdown from "react-countdown-now";

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
    {((
      [tileFiles, setTileFiles] = useState([]),
      [mainFile, setMainFile] = useState(null),
      [mosaicPngURL, setMosaicPngURL] = useState(null),
      [loading, setLoading] = useState(false)
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
          onChange={setTileFiles}
          onError={(error, _file) =>
            alert(`Something went wrong. ${error.code}: ${error.message}`)
          }
          accepts={["image/*"]}
          multiple
          clickable
        >
          {tileFiles.length === 0
            ? "Choose / drop images HERE"
            : tileFiles.map(file => (
                <img
                  style={{ maxHeight: 50, maxWidth: 50, padding: 5 }}
                  src={file.preview.url}
                  key={file.id}
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
