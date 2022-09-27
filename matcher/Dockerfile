FROM python:3.9.14

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --ignore-installed --upgrade-strategy only-if-needed -r requirements.txt
COPY face.json face.db performers.json /app/

COPY main.py /app/

CMD [ "/app/main.py" ]