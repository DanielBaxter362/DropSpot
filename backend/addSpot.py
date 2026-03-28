from flask import Flask, render_template, request
from math import cos, radians
import mysql.connector

#app = Flask(__name__)

def deltaLat(mileDistance):
    return mileDistance / 69

def deltaLon(lat, mileDistance):
    return mileDistance / (69 * cos(radians(lat)))

def getDBConnection():
    conn = mysql.connector.connect(
        host="mysql-35696173-dropspot.e.aivencloud.com",
        user="avnadmin",
        port=18662,
        password="AVNS_ItCf9ga7ieYw24gVSqi",
        database="defaultdb",
        ssl_ca="ca.pem"
    )
    return conn

def addSpotDB(userID, content, lat, lon):
    conn = getDBConnection()
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO notes (userID, content, latitude, longitude, hotspot) VALUES (%s, %s, %s, %s, FALSE)",
        (userID, content, lat, lon)
    )

    conn.commit()
    conn.close()

#OLD function to get all spots in 0.5 mile range
#def getSpotsInRangeDB(lat, lon):
#    conn = getDBConnection()
#    cursor = conn.cursor()
#
#    radius = 0.5
#    latdiff = deltaLat(radius)
#    londiff = deltaLon(lat, radius)
#
#    maxlat = lat + latdiff
#    minlat = lat - latdiff
#    maxlon = lon + londiff
#    minlon = lon - londiff
#
#    cursor.execute("""
#        SELECT latitude, longitude 
#        FROM notes 
#        WHERE latitude BETWEEN %s AND %s
#        AND longitude BETWEEN %s AND %s;
#    """, (minlat, maxlat, minlon, maxlon))
#
#    spots = cursor.fetchall()
#
#    #cursor.execute("DELETE FROM spots")
#
#    conn.commit()
#    conn.close()
#
#    return spots

def init_addSpot(app):
    #@app.route("/")
    #def home():
    #    return render_template("home.html")

    #deletes all records from table
    #@app.route("/clear", methods=["POST"])
    def clearDB():
        conn = getDBConnection()
        cursor = conn.cursor()
    
        cursor.execute("DELETE FROM notes")
    
        conn.commit()
        conn.close()
    
        return render_template("home.html")
    
    #add spot to the database
    #@app.route("/add_spot", methods=["POST"])
    def addSpot():
        #Replace with frontend add note form:
        #userID = ...
        #content = ...
        #lat = float(...)
        #lon = float(...)
    
        #addSpotDB(userID, content, lat, lon)
    
        return render_template("home.html")

#OLD function to get all spots in 0.5 mile range  
#    @app.route("/search", methods=["POST"])
#    def search():
#        lat = float(request.form["lat"])
#        lon = float(request.form["lon"])
#    
#        spots = getSpotsInRangeDB(lat, lon)
#    
#        return render_template("results.html", nodes=spots)

