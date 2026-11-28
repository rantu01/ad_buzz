import UserChatInterface from "@/app/Component/Chat/UserChatInterface";

export default function UserChatPage() {
  // Full customer chat only: show who replied (name + actual role) above each
  // incoming message. The floating widget renders the same interface without
  // this flag and stays unchanged.
  return <UserChatInterface showSenderIdentity showHelpMenu />;
}
