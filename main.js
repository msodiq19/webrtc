import "./style.css";

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBILd15DdJlMWZzXUOInh_0OrlHo_qdYag",
  authDomain: "webrtc-a88a7.firebaseapp.com",
  projectId: "webrtc-a88a7",
  storageBucket: "webrtc-a88a7.appspot.com",
  messagingSenderId: "776720402680",
  appId: "1:776720402680:web:5d8220e5bed1ac5abe530d",
  measurementId: "G-7YNL84QC9G",
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function getXirsysIceServers() {
  try {
    const response = await fetch("https://global.xirsys.net/_turn/webrtc", {
      method: "PUT",
      headers: {
        Authorization:
          "Basic " + btoa("harkanday:8557b192-3c61-11ef-a6ef-0242ac130002"),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching ICE servers: ${response.statusText}`);
    }

    const iceServers = await response.json();
    return iceServers.v.iceServers;
  } catch (error) {
    console.error("Error fetching Xirsys ICE servers:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const xirsysIceServers = await getXirsysIceServers();

  // Select up to two servers for better performance
  const selectedIceServers = xirsysIceServers.slice(0, 2);

  const servers = {
    iceServers: selectedIceServers,
    iceCandidatePoolSize: 10,
  };

  const pc = new RTCPeerConnection(servers);
  let localStream = null;
  let remoteStream = null;

  // HTML elements
  const webcamButton = document.getElementById("webcamButton");
  const webcamVideo = document.getElementById("webcamVideo");
  const callButton = document.getElementById("callButton");
  const callInput = document.getElementById("callInput");
  const answerButton = document.getElementById("answerButton");
  const remoteVideo = document.getElementById("remoteVideo");
  const hangupButton = document.getElementById("hangupButton");

  // 1. Setup media sources
  webcamButton.onclick = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      remoteStream = new MediaStream();

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      };

      webcamVideo.srcObject = localStream;
      remoteVideo.srcObject = remoteStream;

      callButton.disabled = false;
      answerButton.disabled = false;
      webcamButton.disabled = true;
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  };

  // 2. Create an offer
  callButton.onclick = async () => {
    const callDocRef = doc(collection(firestore, "calls"));
    const offerCandidatesRef = collection(callDocRef, "offerCandidates");
    const answerCandidatesRef = collection(callDocRef, "answerCandidates");

    callInput.value = callDocRef.id;

    pc.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidatesRef, event.candidate.toJSON());
    };

    try {
      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
      };

      await setDoc(callDocRef, { offer });

      onSnapshot(callDocRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
        }
      });

      onSnapshot(answerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate);
          }
        });
      });

      hangupButton.disabled = false;
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  // 3. Answer the call with the unique ID
  answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDocRef = doc(firestore, "calls", callId);
    const answerCandidatesRef = collection(callDocRef, "answerCandidates");
    const offerCandidatesRef = collection(callDocRef, "offerCandidates");

    pc.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidatesRef, event.candidate.toJSON());
    };

    try {
      const callDocSnapshot = await getDoc(callDocRef);
      const callData = callDocSnapshot.data();

      if (!pc.currentRemoteDescription && callData.offer) {
        const offerDescription = new RTCSessionDescription(callData.offer);
        await pc.setRemoteDescription(offerDescription);

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        };

        await updateDoc(callDocRef, { answer });

        onSnapshot(offerCandidatesRef, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const candidate = new RTCIceCandidate(change.doc.data());
              pc.addIceCandidate(candidate);
            }
          });
        });
      }
    } catch (error) {
      console.error("Error answering call:", error);
    }
  };
});
