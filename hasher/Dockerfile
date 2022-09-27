FROM tensorflow/tensorflow:2.10.0-gpu

WORKDIR /app

COPY weights /root/.deepface/weights

RUN apt-get update && apt-get install -y gcc libgl1-mesa-glx

COPY requirements.txt requirements.txt

RUN pip uninstall -y enum34 && pip install --ignore-installed --upgrade-strategy only-if-needed -r requirements.txt

COPY main.py /app/

CMD [ "/app/main.py" ]