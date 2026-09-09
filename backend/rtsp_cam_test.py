import cv2


class Camera:
    def __init__(self , source=0, width=640, height=480):
        self.source = source
        self.width = width
        self.height = height

        # 開啟攝影機
        self.__cam = cv2.VideoCapture(self.source)

        if not self.__cam.isOpened():
            raise RuntimeError("無法開啟攝影機")

    def __ResizeImage(self, img):
        return cv2.resize(
            img,
            (self.width, self.height),
            interpolation=cv2.INTER_AREA
        )

    def run(self):
        while True:

            ret, img = self.__cam.read()

            if not ret:
                print("Camera read failed")
                break

            show_img = self.__ResizeImage(img)

            cv2.imshow("Camera", show_img)

            # ESC 離開
            if cv2.waitKey(1) & 0xFF == 27:
                break

        self.release()

    def release(self):
        self.__cam.release()
        cv2.destroyAllWindows()