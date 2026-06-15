import { ComponentChildren } from "preact";
import Button from "./button";
import styles from "./menu-header.module.css";

export default function MenuHeader({
  children,
  onGoBack,
}: {
  children: ComponentChildren;
  onGoBack: () => void;
}) {
  return (
    <header class={styles.header}>
      <Button onClick={onGoBack}>Back</Button>
      <h1 class={styles.title}>{children}</h1>
    </header>
  );
}
