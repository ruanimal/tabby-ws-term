# WebSocket Terminal Test Server

## Dockerfile

```Dockerfile
FROM golang:alpine3.23

RUN apk add --no-cache bash

WORKDIR /app

RUN cat <<'EOF' > main.go
package main

import (
    "io"
    "log"
    "net/http"
    "os/exec"

    "github.com/creack/pty"
    "github.com/gorilla/websocket"
)

type Resize struct {
    Width  uint16 `json:"Cols"`
    Height uint16 `json:"Rows"`
}

type Message struct {
    Op   string `json:"Op"`
    Data string `json:"Data,omitempty"`
    Cols uint16 `json:"Cols,omitempty"`
    Rows uint16 `json:"Rows,omitempty"`
}

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
    http.HandleFunc("/exec", handler)
    log.Println("Listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}

func handler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("upgrade failed:", err)
        return
    }
    defer conn.Close()

    cmd := exec.Command("bash")
    ptyFile, err := pty.Start(cmd)
    if err != nil {
        log.Println(err)
        return
    }
    defer ptyFile.Close()

    send := func(op string, data string) {
        if err := conn.WriteJSON(Message{Op: op, Data: data}); err != nil {
            log.Println("write json failed:", err)
        }
    }

    go func() {
        buf := make([]byte, 4096)
        for {
            n, err := ptyFile.Read(buf)
            if n > 0 {
                send("stdout", string(buf[:n]))
            }
            if err != nil {
                send("error", err.Error())
                return
            }
        }
    }()

    go func() {
        for {
            var msg Message
            if err := conn.ReadJSON(&msg); err != nil {
                return
            }
            switch msg.Op {
            case "stdin":
                if _, err := io.WriteString(ptyFile, msg.Data); err != nil {
                    send("error", err.Error())
                    return
                }
            case "resize":
                if err := pty.Setsize(ptyFile, &pty.Winsize{Cols: msg.Cols, Rows: msg.Rows}); err != nil {
                    send("error", err.Error())
                    return
                }
            }
        }
    }()

    cmd.Wait()
}
EOF

RUN go mod init fake \
 && go mod tidy \
 && go build -o server main.go

CMD ["./server"]
```

## build & test

```
sudo docker build -t fake-kube-exec .
sudo docker run -it --rm -p 127.0.0.1:8080:8080 fake-kube-exec

/Applications/Tabby.app/Contents/MacOS/Tabby quickConnect ws-term ws://127.0.0.1:8080/ex
ec
```
